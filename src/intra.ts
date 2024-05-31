import { PrismaClient } from "@prisma/client";
import Fast42 from "@codam/fast42";
import fs from 'fs';
import https from 'https';
import { monthToNumber } from './utils';

const CAMPUS_ID: number = parseInt(process.env.INTRA_CAMPUS_ID!);

const prisma = new PrismaClient();

/**
 * Fetch all items from all pages of a Fast42 API endpoint.
 * @usage const codamStudents = await fetchMultiple42ApiPages(api, '/v2/campus/14/users');
 * @param api A Fast42 instance
 * @param path The API path to fetch
 * @param params Optional query parameters for the API request
 * @returns A promise that resolves to an array containing all items from all pages of the API responses
 */
const fetchMultiple42ApiPages = async function(api: Fast42, path: string, params: { [key: string]: string } = {}): Promise<any[]> {
	return new Promise(async (resolve, reject) => {
		try {
			const pages = await api.getAllPages(path, params);

			let i = 0;
			const pageItems = await Promise.all(pages.map(async (page) => {
				console.debug(`Fetching page ${++i} of ${pages.length}...`);
				const p = await page;
				if (p.status == 429) {
					throw new Error('Intra API rate limit exceeded');
				}
				if (p.ok) {
					const data = await p.json();
					return data;
				}
				else {
					throw new Error(`Intra API error: ${p.status} ${p.statusText} on ${p.url}`);
				}
			}));
			return resolve(pageItems.flat());
		}
		catch (err) {
			return reject(err);
		}
	});
};

const syncData = async function(api: Fast42, syncDate: Date, lastSyncDate: Date | undefined, path: string, params: any): Promise<any[]> {
	if (lastSyncDate !== undefined) {
		params['range[updated_at]'] = `${lastSyncDate.toISOString()},${syncDate.toISOString()}`;
		console.log(`Fetching data from Intra API updated on path ${path} since ${lastSyncDate.toISOString()}...`);
	}
	else {
		console.log(`Fetching all data from Intra API on path ${path}...`);
	}

	return await fetchMultiple42ApiPages(api, path, params);
};

const deleteExistingUserImage = function(login: string): void {
	if (fs.existsSync(`static/images/${login}`)) {
		fs.unlinkSync(`static/images/${login}`);
	}
}

const syncUserImage = async function(api: Fast42, user: any): Promise<void> {
	const image_url = user.image.versions.large;
	if (user.image === null || image_url === null) {
		deleteExistingUserImage(user.login);
		return;
	}

	// Download image and save it to the images folder
	https.get(image_url, (res) => {
		// Delete the file if it already exists
		deleteExistingUserImage(user.login);

		if (res.statusCode !== 200) {
			console.error(`Failed to download image for user ${user.login} at ${image_url}:`, res.statusCode, res.statusMessage);
			return;
		}

		// Create the file and write the image to it
		const file = fs.createWriteStream(`static/images/${user.login}`);
		res.pipe(file);

		// Close the file stream
		file.on('finish', () => {
			file.close();
		});
	}).on('error', (err) => {
		console.error(`Failed to download image for user ${user.login} at ${image_url}:`, err.message);
	});
}

const syncUsers = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'user',
		},
	});

	// Fetch all users from the API updated since the oldest user in the database
	const users = await syncData(api, syncDate, syncKind?.last_synced_at, `/campus/${CAMPUS_ID}/users`, {});

	// Insert or update each user in the database
	let i = 0;
	const total = users.length;
	for (const user of users) {
		console.debug(`Syncing user ${++i}/${total} (${user.login})...`);
		await prisma.user.upsert({
			where: {
				id: user.id,
			},
			update: {
				email: user.email,
				first_name: user.first_name,
				last_name: user.last_name,
				usual_first_name: user.usual_first_name,
				usual_full_name: user.usual_full_name,
				display_name: user.displayname,
				anonymize_date: new Date(user.anonymize_date),
				updated_at: new Date(user.updated_at),
			},
			create: {
				id: user.id,
				login: user.login,
				email: user.email,
				first_name: user.first_name,
				last_name: user.last_name,
				usual_first_name: user.usual_first_name,
				usual_full_name: user.usual_full_name,
				display_name: user.displayname,
				pool_month: user.pool_month,
				pool_month_num: monthToNumber(user.pool_month),
				pool_year: user.pool_year,
				pool_year_num: parseInt(user.pool_year),
				anonymize_date: new Date(user.anonymize_date),
				created_at: new Date(user.created_at),
				updated_at: new Date(user.updated_at),
				kind: user.kind,
			},
		});
		await syncUserImage(api, user);
	}

	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			kind: 'user',
		},
		update: {
			last_synced_at: syncDate,
		},
		create: {
			kind: 'user',
			first_synced_at: syncDate,
			last_synced_at: syncDate,
		},
	});
};

export const syncWithIntra = async function(api: Fast42): Promise<void> {
	const now = new Date();

	await syncUsers(api, now);
};
