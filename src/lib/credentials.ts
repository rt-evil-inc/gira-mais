import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Preferences } from '@capacitor/preferences';

export type Credentials = { email: string; password: string };

const CREDENTIALS_KEY = 'credentials';
/** Where versions before the move to secure storage kept the credentials, in plain text. */
const LEGACY_KEYS = ['email', 'password'];

/**
 * The saved credentials, from the Keychain on iOS and KeyStore-encrypted storage on Android (plain
 * localStorage on the web). Credentials an older version left in Preferences are moved over.
 */
export async function loadCredentials(): Promise<Credentials | null> {
	let saved: Credentials | null = null;
	try {
		// No date conversion: a password shaped like an ISO date would come back as a Date
		saved = await SecureStorage.get(CREDENTIALS_KEY, false) as Credentials | null;
	} catch (error) {
		// Android backs the encrypted data up but not the KeyStore key, so a restore onto a new phone can't read it
		console.error('Could not read the saved credentials', error);
		await SecureStorage.remove(CREDENTIALS_KEY).catch(() => {});
	}
	if (saved?.email && saved.password) return saved;

	const [email, password] = await Promise.all(LEGACY_KEYS.map(key => Preferences.get({ key }).then(r => r.value)));
	if (!email || !password) return null;
	const legacy = { email, password };
	// If secure storage fails, the old copy stays where it is and the move is retried on the next launch
	await saveCredentials(legacy).catch(error => console.error('Could not move the credentials to secure storage', error));
	return legacy;
}

export async function saveCredentials(credentials: Credentials) {
	// Readable while the phone is locked, once it has been unlocked since booting, for when the app starts in the background
	await SecureStorage.set(CREDENTIALS_KEY, credentials, false, undefined, KeychainAccess.afterFirstUnlock);
	await removeLegacyCredentials();
}

export async function clearCredentials() {
	await Promise.all([SecureStorage.remove(CREDENTIALS_KEY), removeLegacyCredentials()]);
}

function removeLegacyCredentials() {
	return Promise.all(LEGACY_KEYS.map(key => Preferences.remove({ key })));
}