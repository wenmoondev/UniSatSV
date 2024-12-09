import React, { useState, useEffect, ChangeEvent, ReactNode } from 'react';
import { Button, message, Modal, Input } from 'antd';
import { theme } from '../styles/theme';

declare global {
  interface Window {
    unisat: any;
    bsv: any;
    getWalletBalance: (address: string) => Promise<number>;
    sendBSV: (amount: number, toAddress: string, bsvAddress: string, privateKey: string) => Promise<void>;
  }
}

interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) return maybeError;
  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    return new Error(String(maybeError));
  }
}

function hexToBytes(hex: string): number[] {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

const DOMAIN_SALT = 'com.yourdomain.bsvwallet.v1';

interface WalletData {
  btcAddress: string;
  bsvAddress: string;
  bsvWallet: any;
  balance: number | null;
}

const LoadingDots = () => {
  return (
    <span style={{ display: 'inline-block' }}>
      <style>
        {`
          @keyframes loadingDots {
            0% { content: '.'; }
            25% { content: '..'; }
            50% { content: '...'; }
            75% { content: '..'; }
            100% { content: '.'; }
          }
          .loading-dots::after {
            content: '.';
            animation: loadingDots 2s infinite;
            display: inline-block;
            width: 20px;
          }
        `}
      </style>
      <span className="loading-dots"></span>
    </span>
  );
};

const GlobalStyles = () => (
  <style>
    {`
      .ant-modal-content,
      .ant-modal-header {
        background-color: #1E1E1E !important;
      }
      .ant-modal-title,
      .ant-modal-close {
        color: #ffffff !important;
      }
      .ant-modal-header {
        border-bottom: none !important;
      }
      .ant-modal-footer {
        border-top: none !important;
      }
      .ant-input {
        color: #ffffff !important;
      }
      .ant-input::placeholder {
        color: #888888 !important;
      }
    `}
  </style>
);

const WalletSignatureComponent: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [walletData, setWalletData] = useState<WalletData>({
    btcAddress: '',
    bsvAddress: '',
    bsvWallet: null,
    balance: null
  });
  const [loading, setLoading] = useState(false);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [sendAmount, setSendAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [feeRate, setFeeRate] = useState('1.0');
  const [activeInput, setActiveInput] = useState<'amount' | 'fee'>('amount');

  useEffect(() => {
    if (connected && walletData.bsvAddress) {
      setTimeout(() => {
        fetchBalance();
      }, 1000);
    }
  }, [connected, walletData.bsvAddress]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>, setter: (value: string) => void) => {
    setter(e.target.value);
  };

  const modalRender = (modal: ReactNode) => (
    <div style={{ backgroundColor: '#1E1E1E', borderRadius: '8px' }}>
      {modal}
    </div>
  );

  const fetchBalance = async () => {
    try {
      if (!window.getWalletBalance) {
        return;
      }
      const balanceSats = await window.getWalletBalance(walletData.bsvAddress);
      setWalletData(prev => ({ ...prev, balance: balanceSats }));
    } catch (error) {
      console.debug('Balance fetch attempt');
    }
  };

  const handleSend = async () => {
    try {
      setSendLoading(true);
      if (!window.sendBSV) {
        return;
      }
      
      const amountSats = Math.floor(parseFloat(sendAmount));
      if (isNaN(amountSats) || amountSats <= 0) {
        return;
      }

      if (!recipientAddress) {
        return;
      }

      await window.sendBSV(
        amountSats, 
        recipientAddress, 
        walletData.bsvAddress,
        walletData.bsvWallet.privateKey
      );
      
      message.success('Transaction sent successfully!');
      setSendModalVisible(false);
      setSendAmount('');
      setRecipientAddress('');
      setFeeRate('1.0');
      await fetchBalance();
    } catch (error) {
      console.debug('Send attempt');
    } finally {
      setSendLoading(false);
    }
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      const accounts = await window.unisat.requestAccounts();
      setWalletData(prev => ({ ...prev, btcAddress: accounts[0] }));
      setConnected(true);
      message.success('Wallet connected successfully!');
    } catch (error: unknown) {
      const errorWithMessage = toErrorWithMessage(error);
      message.error('Failed to connect wallet: ' + errorWithMessage.message);
    } finally {
      setLoading(false);
    }
  };

  const generateBsvWallet = async () => {
    try {
      setLoading(true);
      
      const messageToSign = `[${DOMAIN_SALT}] I authorize the creation of a BSV wallet for my BTC address ${walletData.btcAddress}. This signature will be used as a seed to generate my BSV private key. I understand that this signature is specific to ${window.location.hostname} and should not be shared or used on other sites.`;
      
      console.log('Message to be signed:', messageToSign);
      
      const signature = await window.unisat.signMessage(messageToSign);
      
      const bsv = window.bsv;
      if (!bsv) {
        throw new Error('BSV library not loaded');
      }

      const signatureBytes = hexToBytes(signature);
      const privateKey = bsv.PrivateKey.fromRandom();
      const signatureBuffer = new bsv.deps.Buffer(signatureBytes);
      const hash = bsv.crypto.Hash.sha256(signatureBuffer);
      const bn = bsv.crypto.BN.fromBuffer(hash);
      
      const n = bsv.crypto.BN.fromBuffer(
        new bsv.deps.Buffer('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 'hex')
      );
      const validPrivateKey = bn.mod(n);
      
      const finalPrivateKey = new bsv.PrivateKey(validPrivateKey);
      const publicKey = bsv.PublicKey.fromPrivateKey(finalPrivateKey);
      const address = bsv.Address.fromPublicKey(publicKey);
      
      setWalletData(prev => ({
        ...prev,
        bsvAddress: address.toString(),
        bsvWallet: {
          privateKey: finalPrivateKey.toWIF(),
          address: address.toString(),
          publicKey: publicKey.toString()
        }
      }));
      
      message.success('BSV wallet generated successfully!');
      await fetchBalance();
      
    } catch (error: unknown) {
      const errorWithMessage = toErrorWithMessage(error);
      message.error('Failed to generate BSV wallet: ' + errorWithMessage.message);
      console.error('Error details:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => message.success('Copied to clipboard'))
      .catch(() => message.error('Failed to copy'));
  };

  const copyAddress = () => {
    if (walletData.bsvAddress) {
      copyToClipboard(walletData.bsvAddress);
    }
  };

  const refreshBalance = async () => {
    await fetchBalance();
    message.success('Balance updated');
  };

  const handleSignOut = () => {
    setWalletData({
      btcAddress: '',
      bsvAddress: '',
      bsvWallet: null,
      balance: null
    });
    setConnected(false);
    setShowPrivateKeyModal(false);
    message.success('Signed out successfully');
  };

  return (
    <div 
      style={{ padding: '40px 20px', maxWidth: '520px', width: '100%', margin: '0 auto' }}
      onClick={() => {
        if (connected && walletData.bsvAddress) {
          fetchBalance();
        }
      }}
    >
      <GlobalStyles />
      {!connected ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 0',
          backgroundColor: '#1E1E1E',
          borderRadius: '16px',
          border: '1px solid #2a2a2a',
        }}>
          <h2 style={{ 
            fontSize: '32px', 
            fontWeight: 600, 
            marginBottom: '16px',
            letterSpacing: '-0.5px',
            color: '#ffffff'
          }}>
            BSV Wallet
          </h2>
          <p style={{ 
            color: '#888888', 
            marginBottom: '32px',
            fontSize: '17px',
            lineHeight: '1.5'
          }}>
            Connect your UniSat wallet to continue
          </p>
          <Button 
            type="default"
            onClick={connectWallet} 
            loading={loading}
            size="large"
            style={{
              height: '48px',
              borderRadius: '8px',
              fontSize: '16px',
              backgroundColor: '#ffffff',
              color: '#000000',
              border: 'none',
              fontWeight: 500
            }}
          >
            Connect Wallet
          </Button>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#1E1E1E',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid #2a2a2a'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '32px'
          }}>
            <div>
              <div style={{ color: '#888888', fontSize: '14px' }}>
                {walletData.bsvAddress 
                  ? (isPrivacyMode 
                      ? '••••••...••••'
                      : `${walletData.bsvAddress.slice(0, 6)}...${walletData.bsvAddress.slice(-4)}`)
                  : 'No BSV wallet generated'
                }
              </div>
            </div>
            {!walletData.bsvAddress ? (
              <Button 
                type="default"
                onClick={generateBsvWallet} 
                loading={loading}
                style={{
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 500
                }}
              >
                Generate BSV
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button 
                  type="text"
                  onClick={() => setIsPrivacyMode(!isPrivacyMode)}
                  style={{ color: '#ffffff', opacity: 0.6 }}
                >
                  {isPrivacyMode ? '👁️' : '👁️‍🗨️'}
                </Button>
                <Button 
                  type="text"
                  onClick={() => setShowPrivateKeyModal(true)}
                  style={{ color: '#ffffff', opacity: 0.6 }}
                >
                  🔑
                </Button>
              </div>
            )}
          </div>

          {walletData.bsvAddress && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ color: '#888888', marginBottom: '8px', fontSize: '15px' }}>
                  Balance
                </div>
                <div 
                  onClick={refreshBalance}
                  style={{ 
                    fontSize: '48px', 
                    fontWeight: 600,
                    letterSpacing: '-1px',
                    marginBottom: '16px',
                    cursor: 'pointer',
                    color: '#ffffff'
                  }}
                >
                  {isPrivacyMode ? '••••' : (walletData.balance === null ? <LoadingDots /> : walletData.balance)}
                  <span style={{ 
                    fontSize: '20px', 
                    marginLeft: '8px', 
                    color: '#888888',
                    fontWeight: 400
                  }}>
                    sats
                  </span>
                </div>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(4, 1fr)',
                borderTop: '1px solid #2a2a2a',
                margin: '0 -32px',
              }}>
                <Button 
                  onClick={copyAddress}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '14px',
                    gap: '12px',
                    padding: '16px 0',
                  }}
                  title={isPrivacyMode ? undefined : walletData.bsvAddress}
                >
                  <span style={{ fontSize: '20px' }}>↓</span>
                  Receive
                </Button>
                <Button 
                  onClick={() => setSendModalVisible(true)}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '14px',
                    gap: '12px',
                    padding: '16px 0',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>↑</span>
                  Send
                </Button>
                <Button 
                  onClick={() => window.open('https://changenow.io/exchange?from=BTC&to=BSV', '_blank')}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '14px',
                    gap: '12px',
                    padding: '16px 0',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>$</span>
                  Buy
                </Button>
                <Button 
                  onClick={() => window.open(`https://whatsonchain.com/address/${walletData.bsvAddress}`, '_blank')}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '14px',
                    gap: '12px',
                    padding: '16px 0',
                  }}
                  title={isPrivacyMode ? undefined : walletData.bsvAddress}
                >
                  <span style={{ fontSize: '20px' }}>≡</span>
                  History
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <Modal
        title={<div style={{ color: '#ffffff' }}>Private Key</div>}
        visible={showPrivateKeyModal}
        onCancel={() => setShowPrivateKeyModal(false)}
        footer={
          <Button 
            onClick={handleSignOut}
            style={{
              backgroundColor: '#2A2A2A',
              border: 'none',
              color: '#ffffff',
              width: '100%',
              height: '44px',
              marginTop: '16px',
            }}
          >
            Sign Out
          </Button>
        }
        bodyStyle={{ 
          padding: '24px',
          backgroundColor: '#1E1E1E',
          color: '#ffffff',
          borderRadius: '0 0 8px 8px',
        }}
        modalRender={modalRender}
      >
        <div style={{ marginBottom: '24px' }}>
          <div style={{ 
            padding: '16px',
            backgroundColor: '#2A2A2A',
            borderRadius: '8px',
            fontSize: '14px',
            wordBreak: 'break-all',
            fontFamily: 'SFMono-Regular, Consolas, monospace',
            color: '#ffffff'
          }}>
            {showPrivateKey ? walletData.bsvWallet?.privateKey : '••••••••••••••••••••••••••••••••'}
          </div>
          <Button 
            type="text" 
            onClick={() => setShowPrivateKey(!showPrivateKey)}
            style={{
              color: '#ffffff',
              marginTop: '12px',
              fontSize: '14px',
              padding: 0,
              height: 'auto'
            }}
          >
            {showPrivateKey ? 'Hide' : 'Show'} Private Key
          </Button>
        </div>
        <div style={{ fontSize: '13px', color: '#888888', lineHeight: '1.5' }}>
          Keep your private key secure and never share it. Anyone with access to it can control your funds.
          Never sign similar wallet generation messages on other websites.
        </div>
      </Modal>

      <Modal
        title={<div style={{ color: '#ffffff' }}>Send BSV</div>}
        visible={sendModalVisible}
        onOk={handleSend}
        onCancel={() => {
          setSendModalVisible(false);
          setSendAmount('');
          setRecipientAddress('');
          setFeeRate('1.0');
        }}
        confirmLoading={sendLoading}
        okButtonProps={{ 
          style: { 
            backgroundColor: '#2A2A2A',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
          } 
        }}
        cancelButtonProps={{ 
          style: { 
            backgroundColor: '#2A2A2A',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
          } 
        }}
        bodyStyle={{ 
          padding: '24px',
          backgroundColor: '#1E1E1E',
          color: '#ffffff',
        }}
        modalRender={modalRender}
      >
        <div style={{ marginBottom: '24px' }}>
          <div style={{ color: '#ffffff', marginBottom: '8px' }}>To Address</div>
          <Input
            value={recipientAddress}
            onChange={(e) => handleInputChange(e, setRecipientAddress)}
            placeholder="Enter BSV address"
            style={{
              backgroundColor: '#2A2A2A',
              border: 'none',
              color: '#ffffff',
              height: '44px',
              borderRadius: '8px',
              fontSize: '15px',
            }}
          />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <div 
            style={{ 
              color: '#ffffff', 
              marginBottom: '8px',
              display: 'flex',
              gap: '16px'
            }}
          >
            <span 
              style={{ 
                opacity: activeInput === 'amount' ? 1 : 0.5,
                cursor: 'pointer'
              }}
              onClick={() => setActiveInput('amount')}
            >
              Amount
            </span>
            <span 
              style={{ 
                opacity: activeInput === 'fee' ? 1 : 0.5,
                cursor: 'pointer'
              }}
              onClick={() => setActiveInput('fee')}
            >
              Fee Rate
            </span>
          </div>
          <Input
            value={activeInput === 'amount' ? sendAmount : feeRate}
            onChange={(e) => {
              if (activeInput === 'amount') {
                setSendAmount(e.target.value);
              } else {
                setFeeRate(e.target.value);
              }
            }}
            placeholder={activeInput === 'amount' ? "0" : "1.0"}
            type="number"
            step={activeInput === 'fee' ? "0.1" : "1"}
            suffix={
              <span style={{ color: '#888888' }}>
                {activeInput === 'amount' ? 'sats' : 'sats/byte'}
              </span>
            }
            style={{
              backgroundColor: '#2A2A2A',
              border: 'none',
              color: '#ffffff',
              height: '44px',
              borderRadius: '8px',
              fontSize: '15px',
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default WalletSignatureComponent; 