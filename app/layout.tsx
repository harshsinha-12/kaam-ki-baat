import type { ReactNode } from "react";
export const metadata={title:"Kaam Ki Baat",description:"What was said. What was built. What was verified."};
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="en"><body style={{fontFamily:"system-ui, sans-serif",margin:"2rem auto",maxWidth:820,padding:"0 1rem"}}>{children}</body></html>}
