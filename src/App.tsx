import { useState } from "react";
import { base, signUtil } from "@okxweb3/crypto-lib";
import * as taproot from "./utils/taproot";

import "./App.css";

import { Button, Alert, List, ListItem, TextField } from "@mui/material";
import * as bitcoin from "bitcoinjs-lib";

import BIP32Factory, { BIP32Interface } from "bip32";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
// import * as ecc from '@bitcoin-js/tiny-secp256k1-asmjs';
// import { Buffer } from 'buffer';
import { Utxo, broadcast, fetchUtxos } from "./api";
import { assert } from "console";
import { buildDataOutput, hexToString } from "./utils/databuilder";
import {
	InscribeTxs,
	InscriptionRequest,
	MetaidData,
	PrevOutput,
	inscribe,
} from "./utils/inscribe";
// const livenet = bitcoin.networks.bitcoin;
const testnet = bitcoin.networks.testnet;
// const regtest = regtestUtils.network;

bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const schnorr = signUtil.schnorr.secp256k1.schnorr;

const defaultTxVersion = 2;
const defaultSequenceNum = 0xfffffffd;

type RevealTxParams = {
	commit_tx: bitcoin.Transaction;
	commit_output: Buffer | undefined;
	hashForRevealTX: Buffer | undefined;
	dataAddress: string | undefined;
	witnessForRevealTx: Buffer[] | undefined;
};

const toXOnly = (pubKey: Buffer) => (pubKey.length === 32 ? pubKey : pubKey.slice(1, 33));

const signTxForTaproot = (
	tx: bitcoin.Transaction,
	prevOutputList: Utxo[],
	prevOutScripts: Buffer[],
	keyPairs: BIP32Interface
) => {
	tx.ins.forEach((input, i) => {
		const privateKey = keyPairs.privateKey;

		const values = prevOutputList.map((o) => o.satoshi);
		const hash = tx.hashForWitnessV1(
			i,
			prevOutScripts,
			values,
			bitcoin.Transaction.SIGHASH_DEFAULT
		);
		const tweakedPrivKey = taproot.taprootTweakPrivKey(privateKey!);
		const signature = Buffer.from(schnorr.sign(hash, tweakedPrivKey, base.randomBytes(32)));

		input.witness = [Buffer.from(signature)];
	});
};

function App() {
	const [logs, setLogs] = useState<{
		address: string | undefined;
	} | null>(null);
	const [connected, setConnected] = useState(false);
	const [content, setContent] = useState("");
	const memonic = "age winner pulse repair country lift rally upon huge hold copy carpet";
	const seed = bip39.mnemonicToSeedSync(memonic);
	const btcPath = `m/86'/0'/0'/0/0`;
	const useNetwork = testnet;

	const internalKey = bip32.fromSeed(seed, useNetwork);
	const btcPrivateKey = internalKey.derivePath(btcPath);

	const rootAddress = "tb1p7udctqtfn2tw4lnuemslc0zn3tmv3y558ss66w7thq4rqqz94j5sw9c8as";

	const createCommitTx = async (
		btcPrivateKey: BIP32Interface,
		rootAddress: string,
		dataArray: bitcoin.payments.StackElement[]
	): Promise<RevealTxParams> => {
		// construct op-false data

		// const dataArray = `${toXOnly(leafKey.publicKey).toString("hex")} OP_CHECKSIG`;
		// const leafScript = bitcoin.script.fromASM(dataArray);
		// const dataHex = Buffer.from(JSON.stringify(dataOutput)).toString("hex");

		const leafScript = bitcoin.script.compile(dataArray);
		const scriptTree = {
			output: leafScript,
		};

		const redeem = {
			output: leafScript,
			redeemVersion: 0xc0,
		};

		const {
			address: dataAddress,
			output: commit_output,
			hash: hashForRevealTX,
			witness: witnessForRevealTx,
		} = bitcoin.payments.p2tr({
			internalPubkey: toXOnly(btcPrivateKey.publicKey),
			network: useNetwork,
			redeem,
			scriptTree,
		});

		// ---------------contruct commit commit Psbt--------------
		const commitTx = new bitcoin.Transaction();
		commitTx.version = defaultTxVersion;

		// const commitPsbt = new bitcoin.Psbt({ network: useNetwork });
		const faucetUtxos = await fetchUtxos({
			address: rootAddress,
			network: "testnet",
		});
		const toUseUtxo = faucetUtxos[0]; // presume toUseUtxo.value >= 11546
		console.log("to use utxo have satoshi toUseUtxo.satoshi", toUseUtxo.satoshi);
		assert(toUseUtxo.satoshi > 11546 + 546, true);

		const commitHash = base.reverseBuffer(base.fromHex(toUseUtxo.txId));
		commitTx.addInput(commitHash, toUseUtxo.vout, defaultSequenceNum);

		commitTx.addOutput(commit_output!, 5546);
		const changePkScript = bitcoin.address.toOutputScript(rootAddress!, useNetwork);
		commitTx.addOutput(changePkScript, toUseUtxo.satoshi - 5546 - 6000);
		// const commitTxClone = commitTx.clone();
		signTxForTaproot(
			commitTx,
			[toUseUtxo],
			[bitcoin.address.toOutputScript(rootAddress!, useNetwork)],
			btcPrivateKey
		);
		// commitPsbt.addInput({
		//   hash: toUseUtxo.txId,
		//   index: toUseUtxo.vout,
		//   witnessUtxo: {
		//     value: toUseUtxo.satoshi,
		//     script: bitcoin.address.toOutputScript(rootAddress!, useNetwork),
		//   }, //lock script
		//   tapInternalKey: toXOnly(btcPrivateKey.publicKey), // toXOnly(internalKey.publicKey),
		// });

		// commitPsbt.addOutput({
		//   value: 5546,
		//   address: dataAddress!,
		//   script: commit_output,
		//   witnessScript: bitcoin.address.toOutputScript(dataAddress!, useNetwork),
		// });
		// // if change > 546
		// commitPsbt.addOutput({
		//   value: toUseUtxo.satoshi - 5546 - 6000,
		//   address: rootAddress!,
		// });
		// // no need hash from commit tx
		// const tweakedSigner = btcPrivateKey.tweak(
		//   bitcoin.crypto.taggedHash(
		//     'TapTweak',
		//     Buffer.concat([toXOnly(btcPrivateKey.publicKey)])
		//   )
		// );
		// commitPsbt.signInput(0, tweakedSigner);

		// commitPsbt.finalizeAllInputs(); // must have sign,
		// const commitTx = commitPsbt.extractTransaction();
		const commit_hex = commitTx.toHex();

		console.log("reveal tx", bitcoin.Transaction.fromHex(commit_hex));

		const commitRes = await broadcast({
			rawTx: commit_hex,
			network: "testnet",
			publicKey: btcPrivateKey.publicKey.toString("hex"),
			message: "construct commit tx",
		});
		console.log("commit tx res", commitRes);
		return {
			commit_tx: commitTx,
			dataAddress,
			commit_output,
			witnessForRevealTx,
			hashForRevealTX,
		};
	};

	const createRevealTx = async (
		btcPrivateKey: BIP32Interface,
		rootAddress: string,
		revealTxParams: RevealTxParams
	) => {
		// -----------------------contruct reveal Psbt--------------------
		// const revealPsbt = new bitcoin.Psbt({ network: useNetwork });

		const revealTx = new bitcoin.Transaction();
		revealTx.version = defaultTxVersion;

		// amount from faucet
		const amount = 5546; // 42

		const sendAmount = amount - 5000; // 5000 is gas for reveal tx
		// get faucet
		const revealHash = base.reverseBuffer(base.fromHex(revealTxParams.commit_tx.getId()));
		revealTx.addInput(revealHash, 0, defaultSequenceNum);

		revealTx.addOutput(bitcoin.address.toOutputScript(rootAddress!, useNetwork), sendAmount);

		const finalRevealHash = revealTx.hashForWitnessV1(
			0,
			[revealTxParams.commit_output!],
			[amount],
			bitcoin.Transaction.SIGHASH_DEFAULT,
			revealTxParams.hashForRevealTX
		);

		const signature = Buffer.from(
			schnorr.sign(finalRevealHash, btcPrivateKey.privateKey!, base.randomBytes(32))
		);
		const witnessForRevealTx = revealTxParams.witnessForRevealTx!;
		revealTx.ins[0].witness = [Buffer.from(signature), ...witnessForRevealTx];

		// revealPsbt.addInput({
		//   hash: revealTxParams.commit_tx.getId(),
		//   index: 0,
		//   witnessUtxo: { value: amount, script: revealTxParams.commit_output! },
		//   tapInternalKey: toXOnly(btcPrivateKey.publicKey), // toXOnly(internalKey.publicKey),
		//   tapMerkleRoot: revealTxParams.hashForRevealTX,
		//   //   witnessScript: revealTxParams.commit_output!,
		// });
		// revealPsbt.addOutput({ value: sendAmount, address: rootAddress! });

		// const tweakedSigner2 = btcPrivateKey.tweak(
		//   bitcoin.crypto.taggedHash(
		//     'TapTweak',
		//     Buffer.concat([
		//       toXOnly(btcPrivateKey.publicKey),
		//       revealTxParams.hashForRevealTX!,
		//     ])
		//   )
		// );

		// revealPsbt.signInput(0, tweakedSigner2);

		// revealPsbt.finalizeAllInputs();
		// const revealTx = revealPsbt.extractTransaction();
		const reveal_hex = revealTx.toHex();
		console.log("reveal hex", hexToString(reveal_hex));
		const revealRes = await broadcast({
			rawTx: reveal_hex,
			network: "testnet",
			publicKey: btcPrivateKey.publicKey.toString("hex"),
			message: "construct reveal tx",
		});

		console.log("reveal tx res", revealRes);
		return reveal_hex;
	};

	const onConnect = async () => {
		// const seed = bip39.mnemonicToSeedSync(memonic);
		// const internalKey = bip32.fromSeed(seed, regtest);
		// const leafKey = bip32.fromSeed(seed, regtest);
		// const dataArray = `${toXOnly(leafKey.publicKey).toString("hex")} OP_CHECKSIG`;
		// const leafScript = bitcoin.script.fromASM(dataArray);
		// const scriptTree = {
		// 	output: leafScript,
		// };
		// const { output, address, hash } = bitcoin.payments.p2tr({
		// 	internalPubkey: toXOnly(internalKey.publicKey),
		// 	scriptTree,
		// 	network: regtest,
		// });
		// --------------------------------------------------------
		// ---------------contruct commit Psbt--------------
		// const commitPsbt = new bitcoin.Psbt({ network: useNetwork });
		// const faucetUtxos = await fetchUtxos({ address: rootAddress, network: "testnet" });
		// const toUseUtxo = faucetUtxos[0]; // presume toUseUtxo.value >= 11546
		// console.log("to use utxo", toUseUtxo);
		// assert(toUseUtxo.satoshi > 11546 + 546, true);
		// commitPsbt.addInput({
		// 	hash: toUseUtxo.txId,
		// 	index: toUseUtxo.vout,
		// 	witnessUtxo: {
		// 		value: toUseUtxo.satoshi,
		// 		script: bitcoin.address.toOutputScript(rootAddress!, useNetwork),
		// 	}, //lock script
		// 	tapInternalKey: toXOnly(btcPrivateKey.publicKey), // toXOnly(internalKey.publicKey),
		// });
		// commitPsbt.addOutput({
		// 	value: 5546,
		// 	address: dataAddress!,
		// });
		// // if change > 546
		// commitPsbt.addOutput({
		// 	value: toUseUtxo.satoshi - 5546 - 6000,
		// 	address: rootAddress!,
		// });
		// // no need hash from commit tx
		// const tweakedSigner = btcPrivateKey.tweak(
		// 	bitcoin.crypto.taggedHash("TapTweak", Buffer.concat([toXOnly(btcPrivateKey.publicKey)]))
		// );
		// commitPsbt.signInput(0, tweakedSigner);
		// commitPsbt.finalizeAllInputs(); // must have sign,
		// const commit_tx = commitPsbt.extractTransaction();
		// const commit_hex = commit_tx.toHex();
		// const commitRes = await broadcast({
		// 	rawTx: commit_hex,
		// 	network: "testnet",
		// 	publicKey: btcPrivateKey.publicKey.toString("hex"),
		// 	message: "construct commit tx",
		// });
		// console.log("commit tx res", commitRes);
		// // -----------------------contruct reveal Psbt--------------------
		// const revealPsbt = new bitcoin.Psbt({ network: useNetwork });
		// // amount from faucet
		// const amount = 5546; // 42
		// const sendAmount = amount - 5000; // 5000 is gas for reveal tx
		// // get faucet
		// revealPsbt.addInput({
		// 	hash: commit_tx.getId(),
		// 	index: 0,
		// 	witnessUtxo: { value: amount, script: output! },
		// 	tapInternalKey: toXOnly(btcPrivateKey.publicKey), // toXOnly(internalKey.publicKey),
		// 	tapMerkleRoot: hashForRevealTX,
		// });
		// revealPsbt.addOutput({ value: sendAmount, address: rootAddress! });
		// const tweakedSigner2 = btcPrivateKey.tweak(
		// 	bitcoin.crypto.taggedHash(
		// 		"TapTweak",
		// 		Buffer.concat([toXOnly(btcPrivateKey.publicKey), hashForRevealTX!])
		// 	)
		// );
		// revealPsbt.signInput(0, tweakedSigner2);
		// revealPsbt.finalizeAllInputs();
		// const reveal_tx = revealPsbt.extractTransaction();
		// const reveal_hex = reveal_tx.toHex();
		// const revealRes = await broadcast({
		// 	rawTx: reveal_hex,
		// 	network: "testnet",
		// 	publicKey: btcPrivateKey.publicKey.toString("hex"),
		// 	message: "construct reveal tx",
		// });
		// console.log("reveal tx res", revealRes);

		setLogs({ address: rootAddress });
		setConnected(true);
	};

	const onInitMetaid = async () => {
		const dataArray_init = buildDataOutput({
			publicKey: toXOnly(btcPrivateKey.publicKey),
			operation: "init",
		});

		const initRevealTxParams = await createCommitTx(btcPrivateKey, rootAddress, dataArray_init);
		const initRevealHex = await createRevealTx(btcPrivateKey, rootAddress, initRevealTxParams);
	};

	const onTestBuzz = async () => {
		const dataArray_buzz = buildDataOutput({
			publicKey: toXOnly(btcPrivateKey.publicKey),
			operation: "create",
			path: "/protocols/SimpleBuzz/4",
			body: { content: "JSON IS COMING!!!" },
		});

		const buzzRevealTxParams = await createCommitTx(btcPrivateKey, rootAddress, dataArray_buzz);
		const buzzRevealHex = await createRevealTx(btcPrivateKey, rootAddress, buzzRevealTxParams);
	};

	const onSendBuzz = () => {
		const a2 = bitcoin.script.decompile(
			base.fromHex(
				"036f72645117746578742f706c61696e3b636861727365743d7574663800357b2270223a226472632d3230222c226f70223a226d696e74222c227469636b223a226c70706c222c22616d74223a2231303030227d473044022079fab4fdae667244313971c933254e5102160ced7a7f70b879a969e5e7750ec802202a8b4394fd901a93ffaae3af26dc07028d7846a9d3dcde3f2e0deeed9d34ab5f0129210257a64f1536472326d5fe61b21df965659847e14d2e885fd156761087489f0088ad757575757551"
			)
		);
		console.log("a2", a2);
	};

	const onInitWithOKX = async () => {
		const faucetUtxos = await fetchUtxos({
			address: rootAddress,
			network: "testnet",
		});
		const toUseUtxo = faucetUtxos[0]; // presume toUseUtxo.value >= 11546
		console.log("to use utxo have satoshi toUseUtxo.satoshi", toUseUtxo.satoshi);
		assert(toUseUtxo.satoshi > 11546 + 546, true);
		const commitTxPrevOutputList: PrevOutput[] = [
			{
				txId: toUseUtxo.txId,
				vOut: toUseUtxo.vout,
				amount: toUseUtxo.satoshi,
				address: rootAddress,
				keyPairs: btcPrivateKey,
			},
		];
		const metaidDataList: MetaidData[] = [
			{
				operation: "init",
				revealAddr: rootAddress,
			},
		];

		const request: InscriptionRequest = {
			commitTxPrevOutputList,
			commitFeeRate: 1,
			revealFeeRate: 1,
			revealOutValue: 546,
			metaidDataList,
			changeAddress: rootAddress,
		};
		const txs: InscribeTxs = inscribe(useNetwork, request);
		console.log("InscribeTxs", txs);
	};
	const onInitWithMock = async () => {
		const inscribeTx = {
			commitTx:
				"02000000000101686b5f2b5784318b292e2864c404a89521da44de5fe5533e73a3efbeb72af78a0100000000fdffffff02a60200000000000022512091398cfb2aacb26180522125996919553b9ccfb89cc92a1e856c568dfca308d0d0b9190000000000225120f71b8581699a96eafe7ccee1fc3c538af6c892943c21ad3bcbb82a300045aca901403fa41bf79e632318271392fcdab6ca6483946692f250df0305607088b6f6bdc90fe9a7a08c9db176be1a5c7cb8df861f2132f31cda3946394107e016bba6b62100000000",
			revealTxs: [
				"020000000001016e2d4cde51152f9a759310a35b71ff4e745cd869537154033cc286191b7b295a0000000000fdffffff012202000000000000225120f71b8581699a96eafe7ccee1fc3c538af6c892943c21ad3bcbb82a300045aca90340eca0c66389834d4f62b9509ace852a1e7ab7c9519b3aaf3cec6e262efdf84e9b664f86676e30de7b179a7f50f77a7837b6fe0e1bdf1129a0e961af135358f52d312095f221c1f83031e274472928594a2d01945abec6abf656719fde89de4e940197ac00630674657374696404696e69746821c095f221c1f83031e274472928594a2d01945abec6abf656719fde89de4e94019700000000",
			],
			commitTxFee: 154,
			revealTxFees: [132],
			commitAddrs: ["tb1pjyuce7e24jexrqzjyyjej6ge25aeenacnnyj5859d3tgml9rprgqct3fjz"],
		};

		const commitRes = await broadcast({
			rawTx: inscribeTx.commitTx,
			network: "testnet",
			publicKey: btcPrivateKey.publicKey.toString("hex"),
			message: "construct commit tx",
		});

		console.log("reveal commit res", commitRes);

		const revealRes = await broadcast({
			rawTx: inscribeTx.revealTxs[0],
			network: "testnet",
			publicKey: btcPrivateKey.publicKey.toString("hex"),
			message: "construct reveal tx",
		});

		console.log("reveal tx res", revealRes);
	};
	return (
		<div className="">
			{connected ? (
				<div className="flex gap-2 place-content-center">
					<Button
						variant="outlined"
						onClick={() => {
							setConnected(false);
							setLogs(null);
						}}
					>
						disnnect wallet
					</Button>
					<Button onClick={onInitMetaid}>Init Metaid</Button>
					<Button onClick={onTestBuzz}>Send Buzz</Button>
					<Button onClick={onInitWithOKX}>Init With OKX</Button>
					<Button onClick={onInitWithMock}>Init With Mock</Button>
				</div>
			) : (
				<Button variant="contained" onClick={onConnect}>
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
