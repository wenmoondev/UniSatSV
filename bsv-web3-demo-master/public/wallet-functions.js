// Wallet functionality for BSV operations

async function getUTXOs(address) {
    try {
        const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`);
        const utxos = await response.json();
        return utxos;
    } catch (error) {
        console.error('Error fetching UTXOs:', error);
        throw error;
    }
}

async function getWalletBalance(address) {
    try {
        const utxos = await getUTXOs(address);
        const balance = utxos.reduce((total, utxo) => total + utxo.value, 0);
        return balance;
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        throw error;
    }
}

async function sendBSV(amount, toAddress, fromAddress, privateKeyWIF) {
    try {
        if (!window.bsv) {
            throw new Error('BSV library not loaded');
        }

        // Create a new transaction
        const tx = new window.bsv.Transaction();

        // Add the recipient output
        tx.to(toAddress, amount);

        // Get UTXOs for the sending address
        const utxos = await getUTXOs(fromAddress);
        
        // Calculate total available balance
        const totalBalance = utxos.reduce((total, utxo) => total + utxo.value, 0);
        
        if (totalBalance < amount) {
            throw new Error('Insufficient balance');
        }

        // Add inputs
        utxos.forEach(utxo => {
            tx.from({
                txId: utxo.tx_hash,
                outputIndex: utxo.tx_pos,
                script: window.bsv.Script.buildPublicKeyHashOut(fromAddress).toString(),
                satoshis: utxo.value
            });
        });

        // Add change output if necessary
        const fee = 1000; // 1000 satoshis fee
        const change = totalBalance - amount - fee;
        if (change > 0) {
            tx.to(fromAddress, change);
        }

        // Sign the transaction
        const privateKey = window.bsv.PrivateKey.fromWIF(privateKeyWIF);
        tx.sign(privateKey);

        // Broadcast the transaction
        const txHex = tx.toString();
        const response = await fetch('https://api.bitails.io/tx/broadcast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                raw: txHex
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Broadcast response:', errorText);
            throw new Error('Failed to broadcast transaction');
        }

        try {
            const result = await response.json();
            return result;
        } catch (error) {
            // If the response is empty or not JSON, but the status was ok, consider it successful
            if (response.ok) {
                return { txid: txHex.substring(0, 64) }; // Return first 64 chars as txid
            }
            throw error;
        }
    } catch (error) {
        console.error('Error sending BSV:', error);
        throw error;
    }
}

// Expose functions to window object
window.getWalletBalance = getWalletBalance;
window.sendBSV = sendBSV; 