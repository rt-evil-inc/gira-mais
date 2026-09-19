import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';

const dev = process.argv.includes('--dev');
const install = process.argv.includes('--install');

(async () => {
	try {
		if (dev) {
			await syncNetworkConfig();
			await updateAppId(true);
		} else {
			await execCommand('vite build && npx cap sync');
		}
		await execCommand(`cd android && ${os.platform() === 'win32' ? 'gradlew' : './gradlew'} ${install ? 'installDebug' : 'assembleDebug'}`);
		if (dev) await updateAppId();
	} catch (e) {
		await updateAppId();
		await cleanupNetworkConfig();
		if (e instanceof Error) console.error(e.message);
		else console.error(e);
		process.exit(-1);
	}
})();

function execCommand(command) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, { stdio: 'inherit', shell: true });
		child.on('error', reject);
		child.on('exit', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command exited with code ${code}`));
			}
		});
	});
}

const files = [
	'android/app/build.gradle',
	'android/app/src/main/res/values/strings.xml',
	'ios/App/App/Info.plist',
	'ios/App/App.xcodeproj/project.pbxproj',
];

async function updateAppId(dev = false) {
	for (const file of files) {
		let content = await fs.readFile(file, 'utf8');
		if (dev) {
			content = content.replaceAll(/(?<!namespace ")dev\.tteles\.gira(?!\.dev)/g, 'dev.tteles.gira.dev');
			content = content.replaceAll(/Gira\+(?! Dev)/g, 'Gira+ Dev');
		} else {
			content = content.replaceAll(/(?<!namespace ")dev\.tteles\.gira\.dev/g, 'dev.tteles.gira');
			content = content.replaceAll('Gira+ Dev', 'Gira+');
		}
		await fs.writeFile(file, content, 'utf8');
	}
}

async function syncNetworkConfig() {
	const port = await getPort();
	const capacitorConfigRaw = await fs.readFile('./capacitor.config.json');
	await fs.copyFile('./capacitor.config.json', `./capacitor.config.json.timestamp-${Date.now()}`);
	const config = JSON.parse(String(capacitorConfigRaw));
	if (!config.server) config.server = {};
	// Use localhost + adb reverse for secure context (crypto.subtle requires secure context)
	config.server.url = `http://localhost:${port}/`;
	config.server.cleartext = true;
	await fs.writeFile('./capacitor.config.json', JSON.stringify(config));
	await execCommand('npx cap sync');
	// Set up adb reverse so device's localhost:port forwards to host machine
	await execCommand(`adb reverse tcp:${port} tcp:${port}`);
	await cleanupNetworkConfig();
}

async function getPort() {
	const file = await fs.readFile('./vite.config.ts');
	const match = String(file).match(/port:\s*(\d+)/);
	return match?.[1] ?? 5173;
}

async function cleanupNetworkConfig() {
	const files = await fs.readdir('./');
	for (const file of files) {
		if (file.match(/capacitor\.config\.json\.timestamp-\d+/g)) {
			await fs.copyFile(`./${file}`, './capacitor.config.json');
			await fs.unlink(file);
		}
	}
}