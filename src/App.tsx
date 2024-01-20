import { useState } from "react";

import "./App.css";

import { Button, Alert, List, ListItem, TextField } from "@mui/material";
import * as bitcoin from "bitcoinjs-lib";

import BIP32Factory from "bip32";
import * as bip39 from "bip39";
// import * as ecc from "tiny-secp256k1";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { regtestUtils } from "./_regtest";
import { Buffer } from "buffer";
import { fetchUtxos } from "./api";
import { assert } from "console";
// const livenet = bitcoin.networks.bitcoin;
const testnet = bitcoin.networks.testnet;
const regtest = regtestUtils.network;

bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

const toXOnly = (pubKey: Buffer) => (pubKey.length === 32 ? pubKey : pubKey.slice(1, 33));

function App() {
	const [logs, setLogs] = useState<{ address: string | undefined } | null>(null);
	const [connected, setConnected] = useState(false);
	const [content, setContent] = useState("");
	const memonic = "age winner pulse repair country lift rally upon huge hold copy carpet";
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

		const useNetwork = testnet;
		const seed = bip39.mnemonicToSeedSync(memonic);
		const btcPath = `m/86'/0'/0'/0/0`;
		const internalKey = bip32.fromSeed(seed, useNetwork);
		const btcPrivateKey = internalKey.derivePath(btcPath);

		// construct op-false data for utxo output
		const dataOutput = { body: "Hello World", operation: "create" };
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
			hash,
		} = bitcoin.payments.p2tr({
			internalPubkey: toXOnly(btcPrivateKey.publicKey),
			network: useNetwork,
			scriptTree,
		});
		const master_pubkey = btcPrivateKey.publicKey.slice(1, 33);

		// ---------------contruct commit commit Psbt--------------
		const commitPsbt = new bitcoin.Psbt({ network: useNetwork });
		const faucetUtxos = await fetchUtxos({ address: rootAddress, network: "testnet" });
		const toUseUtxo = faucetUtxos[0]; // presume toUseUtxo.value >= 11546
		assert(toUseUtxo.satoshi > 11546 + 546, true);

		commitPsbt.addInput({
			hash: toUseUtxo.txId,
			index: toUseUtxo.vout,
			witnessUtxo: {
				value: toUseUtxo.satoshi,
				script: bitcoin.address.toOutputScript(rootAddress!, useNetwork),
			}, //lock script
			tapInternalKey: master_pubkey, // toXOnly(internalKey.publicKey),
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

		const tweakedSigner = btcPrivateKey.tweak(
			bitcoin.crypto.taggedHash("TapTweak", Buffer.concat([master_pubkey, hash!]))
		);
		commitPsbt.signInput(0, tweakedSigner);

		commitPsbt.finalizeAllInputs(); // must have sign,
		const tx_commit = commitPsbt.extractTransaction();
		const hex_commit = tx_commit.toHex();
		// const rawTx_commit = tx_commit.toBuffer();
		// const hex_commit = rawTx_commit.toString("hex");

		const commitRes = await regtestUtils.broadcast(hex_commit);
		console.log("commit tx res", commitRes);

		// -----------------------contruct commit revealPsbt--------------------
		const revealPsbt = new bitcoin.Psbt({ network: useNetwork });

		// amount from faucet
		const amount = 5546; // 42
		// const unspent = await regtestUtils.faucetComplex(output!, amount);
		// amount to send
		const sendAmount = amount - 5000; // 5000 is gas for reveal tx
		// get faucet

		revealPsbt.addInput({
			hash: tx_commit.getId(),
			index: 0,
			witnessUtxo: { value: amount, script: output! },
			tapInternalKey: master_pubkey, // toXOnly(internalKey.publicKey),
			tapMerkleRoot: hash,
		});
		revealPsbt.addOutput({ value: sendAmount, address: rootAddress! });

		// const tweakedSigner = internalKey.tweak(
		// 	bitcoin.crypto.taggedHash("TapTweak", Buffer.concat([master_pubkey, hash!]))
		// );
		revealPsbt.signInput(0, tweakedSigner);

		revealPsbt.finalizeAllInputs();
		const tx_reveal = revealPsbt.extractTransaction();
		const hex_reveal = tx_reveal.toHex();
		// const rawTx_reveal = tx_reveal.toBuffer();
		// const hex_reveal = rawTx_reveal.toString("hex");

		await regtestUtils.broadcast(hex_reveal);

		console.log("txid", tx_reveal.getId());

		setLogs({ address: rootAddress });
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
