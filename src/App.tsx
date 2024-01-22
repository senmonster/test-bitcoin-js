import { useState } from "react";

import "./App.css";

import { Button, Alert, List, ListItem, TextField } from "@mui/material";
import * as bitcoin from "bitcoinjs-lib";

import BIP32Factory, { BIP32Interface } from "bip32";
import * as bip39 from "bip39";
// import * as ecc from "tiny-secp256k1";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Buffer } from "buffer";
import { broadcast, fetchUtxos } from "./api";
import { assert } from "console";
// const livenet = bitcoin.networks.bitcoin;
const testnet = bitcoin.networks.testnet;
// const regtest = regtestUtils.network;

bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

const toXOnly = (pubKey: Buffer) => (pubKey.length === 32 ? pubKey : pubKey.slice(1, 33));

function App() {
	const [logs, setLogs] = useState<{
		address: string | undefined;
		txid: string | undefined;
	} | null>(null);
	const [connected, setConnected] = useState(false);
	const [content, setContent] = useState("");
	const memonic = "age winner pulse repair country lift rally upon huge hold copy carpet";
	const seed = bip39.mnemonicToSeedSync(memonic);
	const btcPath = `m/86'/0'/0'/0/0`;
	const useNetwork = testnet;

	const internalKey = bip32.fromSeed(seed, useNetwork);
	const btcPrivateKey = internalKey.derivePath(btcPath);

	const createCommitTx = (keyPairs: BIP32Interface) => {};

	const createRevealTx = () => {};

	const onShowAdr = async () => {
		// const seed = bip39.mnemonicToSeedSync(memonic);
		// const internalKey = bip32.fromSeed(seed, regtest);
		// const leafKey = bip32.fromSeed(seed, regtest);

		// const leafScriptAsm = `${toXOnly(leafKey.publicKey).toString("hex")} OP_CHECKSIG`;
		// const leafScript = bitcoin.script.fromASM(leafScriptAsm);

		// const scriptTree = {
		// 	output: leafScript,
		// };

		// const { output, address, hash } = bitcoin.payments.p2tr({
		// 	internalPubkey: toXOnly(internalKey.publicKey),
		// 	scriptTree,
		// 	network: regtest,
		// });

		// construct op-false data for utxo output
		const dataOutput = [
			"metaid", // chain flag
			"create", // operation type
			"/protocols/SimpleBuzz/4", // path to operate, exp:  /protocols/SimpleBuzz  // 4 can use a random number
			"0", // content的加密类型，0为不加密；1为ECIES加密，2为ECDH协商密钥加密
			"1.0.0", // version
			"application/jason", // optional，content-type，default: application/jason
			"utf8", // optional, encoding, default: utf8
			JSON.stringify({ content: "Hello Jason World" }), // payload : stringify json body]
		];
		const dataHex = Buffer.from(JSON.stringify(dataOutput)).toString("hex");
		// const leafScriptAsm = JSON.stringify(dataOutput);
		const leafScript = bitcoin.script.fromASM(dataHex);
		const scriptTree = {
			output: leafScript,
		};
		const rootAddress = "tb1p7udctqtfn2tw4lnuemslc0zn3tmv3y558ss66w7thq4rqqz94j5sw9c8as";
		const {
			address: dataAddress,
			output,
			hash: hashForRevealTX,
		} = bitcoin.payments.p2tr({
			internalPubkey: toXOnly(btcPrivateKey.publicKey),
			network: useNetwork,
			scriptTree,
		});
		const { hash: hashForCommitTX } = bitcoin.payments.p2tr({
			internalPubkey: toXOnly(btcPrivateKey.publicKey),
			network: useNetwork,
		});
		console.log("hashForCommitTX", hashForCommitTX);

		// ---------------contruct commit commit Psbt--------------
		const commitPsbt = new bitcoin.Psbt({ network: useNetwork });
		const faucetUtxos = await fetchUtxos({ address: rootAddress, network: "testnet" });
		const toUseUtxo = faucetUtxos[0]; // presume toUseUtxo.value >= 11546
		console.log("to use utxo", toUseUtxo);
		assert(toUseUtxo.satoshi > 11546 + 546, true);

		commitPsbt.addInput({
			hash: toUseUtxo.txId,
			index: toUseUtxo.vout,
			witnessUtxo: {
				value: toUseUtxo.satoshi,
				script: bitcoin.address.toOutputScript(rootAddress!, useNetwork),
			}, //lock script
			tapInternalKey: toXOnly(btcPrivateKey.publicKey), // toXOnly(internalKey.publicKey),
		});

		commitPsbt.addOutput({
			value: 5546,
			address: dataAddress!,
		});
		// if change > 546
		commitPsbt.addOutput({
			value: toUseUtxo.satoshi - 5546 - 6000,
			address: rootAddress!,
		});
		// no need hash from commit tx
		const tweakedSigner = btcPrivateKey.tweak(
			bitcoin.crypto.taggedHash("TapTweak", Buffer.concat([toXOnly(btcPrivateKey.publicKey)]))
		);
		commitPsbt.signInput(0, tweakedSigner);

		commitPsbt.finalizeAllInputs(); // must have sign,
		const tx_commit = commitPsbt.extractTransaction();
		const hex_commit = tx_commit.toHex();

		const commitRes = await broadcast({
			rawTx: hex_commit,
			network: "testnet",
			publicKey: btcPrivateKey.publicKey.toString("hex"),
			message: "construct commit tx",
		});
		console.log("commit tx res", commitRes);

		// -----------------------contruct commit revealPsbt--------------------
		const revealPsbt = new bitcoin.Psbt({ network: useNetwork });

		// amount from faucet
		const amount = 5546; // 42

		const sendAmount = amount - 5000; // 5000 is gas for reveal tx
		// get faucet

		revealPsbt.addInput({
			hash: tx_commit.getId(),
			index: 0,
			witnessUtxo: { value: amount, script: output! },
			tapInternalKey: toXOnly(btcPrivateKey.publicKey), // toXOnly(internalKey.publicKey),
			tapMerkleRoot: hashForRevealTX,
		});
		revealPsbt.addOutput({ value: sendAmount, address: rootAddress! });

		const tweakedSigner2 = btcPrivateKey.tweak(
			bitcoin.crypto.taggedHash(
				"TapTweak",
				Buffer.concat([toXOnly(btcPrivateKey.publicKey), hashForRevealTX!])
			)
		);

		revealPsbt.signInput(0, tweakedSigner2);

		revealPsbt.finalizeAllInputs();
		const tx_reveal = revealPsbt.extractTransaction();
		const hex_reveal = tx_reveal.toHex();

		const revealRes = await broadcast({
			rawTx: hex_reveal,
			network: "testnet",
			publicKey: btcPrivateKey.publicKey.toString("hex"),
			message: "construct reveal tx",
		});

		console.log("reveal tx res", revealRes);

		setLogs({ address: rootAddress, txid: tx_reveal.getId() });
		setConnected(true);
	};

	const onSendBuzz = () => {};
	return (
		<div className="">
			{connected ? (
				<Button
					variant="outlined"
					onClick={() => {
						setConnected(false);
						setLogs(null);
					}}
				>
					disnnect wallet
				</Button>
			) : (
				<Button variant="contained" onClick={onShowAdr}>
					connect wallet
				</Button>
			)}
			{logs && (
				<Alert className="mt-4" severity="success" color="warning">
					{`Connect Success ! Your BTC Address: ${logs?.address} `}
				</Alert>
			)}

			<div className="flex items-center gap-2 place-content-center mt-4">
				<TextField
					className="w-[600px]"
					color="secondary"
					id="filled-basic"
					label="write something"
					variant="filled"
					value={content}
					onChange={(e) => setContent(e.currentTarget.value)}
				/>
				<Button onClick={onSendBuzz}>Send Buzz</Button>
			</div>

			<div className="font-bold text-3xl mt-6">Buzz List</div>
			<div className="grid place-content-center">
				<List className="mx-auto">
					<ListItem>This is a test buzz.</ListItem>
					<ListItem>This is a test buzz again.</ListItem>
				</List>
			</div>
		</div>
	);
}

export default App;
