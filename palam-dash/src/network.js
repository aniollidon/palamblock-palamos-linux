const { execFile } = require('child_process');

function execFileAsync(command, args, options = {}) {
	return new Promise((resolve) => {
		execFile(command, args, { timeout: 2000, ...options }, (error, stdout) => {
			if (error) {
				return resolve({ ok: false, stdout: '' });
			}
			resolve({ ok: true, stdout: stdout || '' });
		});
	});
}

function normalizeSsid(raw) {
	if (!raw) return 'unknown';
	const line = raw.toString().split('\n').map(s => s.trim()).find(Boolean) || '';
	return line.length > 0 ? line : 'unknown';
}

async function getCurrentSSID() {
	// Try NetworkManager (nmcli)
	const nmcli = await execFileAsync('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi']);
	if (nmcli.ok) {
		const line = nmcli.stdout
			.split('\n')
			.map(s => s.trim())
			.find(s => s.startsWith('yes:'));
		if (line) {
			const ssid = line.slice(4); // remove 'yes:' prefix
			return normalizeSsid(ssid);
		}
	}

	// Fallback: wireless-tools (iwgetid)
	const iwgetid = await execFileAsync('iwgetid', ['-r']);
	if (iwgetid.ok) {
		return normalizeSsid(iwgetid.stdout);
	}

	return 'unknown';
}

module.exports = {
	getCurrentSSID
};


