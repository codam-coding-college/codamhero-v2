import fs from 'fs';
import https from 'https';
import Fast42 from '@codam/fast42';
import { prisma, syncData } from './base';
import { monthToNumber } from '../utils';
import { CAMPUS_ID } from '../env';

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

export const syncUsers = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'user',
		},
	});

	// Fetch all users from the API updated since the last synchronization
	const users = await syncData(api, syncDate, syncKind?.last_synced_at, `/campus/${CAMPUS_ID}/users`, {});

	// Insert or update each user in the database
	let i = 0;
	const total = users.length;
	for (const user of users) {
		console.debug(`Syncing user ${++i}/${total} (${user.login})...`);

		try {
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
		}
		catch (err) {
			console.error(`Error syncing user ${user.login}: ${err}`);
		}

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
