import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import NetworkStatusBanner from '@/ui/NetworkStatusBanner';

const poppins = Poppins({
	subsets: ['latin'],
	weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
	variable: '--font-poppins',
});

export const metadata: Metadata = {
	title: 'Budget Tracker',
	description: 'Budget Tracker',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='en'>
			<body className={`${poppins.variable} overflow-x-hidden bg-gray-100 antialiased`}>
				{children}
				<NetworkStatusBanner />
			</body>
		</html>
	);
}
