import { BrowserProvider } from 'ethers'

declare global {
  interface Window {
    ethereum?: import('ethers').Eip1193Provider
  }
}

export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && Boolean(window.ethereum)
}

export async function connectWallet(): Promise<string> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not detected. Install it to connect your wallet.')
  }
  const provider = new BrowserProvider(window.ethereum!)
  const accounts = await provider.send('eth_requestAccounts', [])
  const address = accounts[0]
  if (!address) throw new Error('No account returned by MetaMask')
  return address
}

export async function signMessage(message: string): Promise<string> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not detected. Install it to connect your wallet.')
  }
  const provider = new BrowserProvider(window.ethereum!)
  const signer = await provider.getSigner()
  return signer.signMessage(message)
}
