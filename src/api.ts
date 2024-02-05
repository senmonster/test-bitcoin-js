import axios from "axios";

export type Utxo = {
	confirmed: boolean;
	inscriptions: string | null;
	satoshi: number;
	txId: string;
	vout: number;
};

export async function fetchUtxos({
	address,
	network = "testnet",
}: {
	address: string;
	network: "livenet" | "testnet";
}): Promise<Utxo[]> {
	const url = `https://www.metalet.space/wallet-api/v3/address/btc-utxo?net=${network}&address=${address}
  `;

	try {
		const data = await axios.get(url).then((res) => res.data);

		return data.data;
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function broadcast({
	rawTx,
	publicKey,
	network,
	message,
}: {
	rawTx: string;
	publicKey: string;
	network: "livenet" | "testnet";
	message: string;
}) {
	const url = `https://www.metalet.space/wallet-api/v3/tx/broadcast`;
	const signature = await window.unisat.signMessage(message);

	try {
		const data = await axios.post(
			url,
			{
				chain: "btc",
				net: network,
				rawTx: rawTx,
			},
			{
				headers: {
					"X-Signature": signature,
					"X-Public-Key": publicKey,
				},
			}
		);
		return data.data;
	} catch (error) {
		console.log(error);
	}
}
