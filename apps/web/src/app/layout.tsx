import './globals.css';import Link from 'next/link';import type { Metadata } from 'next';
export const metadata:Metadata={title:'IKimetr Realtor Collector',description:'Local public professional contact collector'};
const nav=[['/','Dashboard'],['/sources','Sources'],['/keywords','Keywords'],['/contacts','Contacts'],['/runs','Runs'],['/review','Review']];
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body><div className="shell"><aside className="sidebar"><div className="brand">IKIMETR <span>COLLECTOR</span></div><nav>{nav.map(([href,label])=><Link key={href} href={href!}>{label}</Link>)}</nav></aside><main>{children}</main></div></body></html>}
