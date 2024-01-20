import axios from "axios";

export async function fetchUtxos({
	address,
	network = "testnet",
}: {
	address: string;
	network: "mainnet" | "testnet";
}): Promise<
	{
		confirmed: boolean;
		inscriptions: string | null;
		satoshi: number;
		txId: string;
		vout: number;
	}[]
> {
	const url = `https://www.metalet.space/wallet-api/v3/address/btc-utxo?net=${network}&address=${address}
  `;

	try {
		const data = await axios.get(url).then((res) => res.data);

		return data;
	} catch (error) {
		console.error(error);
		return [];
	}
}
