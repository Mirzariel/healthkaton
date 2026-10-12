/* Transisi masuk halaman yang tenang (240 ms, dimatikan bila pengguna memilih "kurangi gerak"). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
