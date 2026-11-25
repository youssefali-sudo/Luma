import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUMA — مساحتك، بطريقتك",
  description: "LUMA مساحة اجتماعية للمحادثات والجروبات والقنوات ومشاركة الملفات واللحظات.",
  applicationName: "LUMA",
};

export const viewport: Viewport = {
  themeColor: "#0b0911",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: true,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
