import React from "react";
import WalletSignatureComponent from "./components/WalletSignatureComponent";

const App: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <WalletSignatureComponent />
    </div>
  );
};

export default App;
