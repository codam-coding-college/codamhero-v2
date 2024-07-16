import Fast42 from '@codam/fast42';
import { prisma, syncData } from './base';
import { monthToNumber } from '../utils';
import { CAMPUS_ID } from '../env';

export const syncUser = async function(user: any): Promise<void> {
	try {
		await prisma.user.upsert({
			where: {
				id: user.id,
			},
			update: {
				login: user.login, // required for anonymization
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
				updated_at: new Date(user.updated_at),
				image: (user.image && user.image.versions && user.image.versions.large) ? user.image.versions.large : null,
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
				image: (user.image && user.image.versions && user.image.versions.large) ? user.image.versions.large : null,
			},
		});
	}
	catch (err) {
		console.error(`Error syncing user ${user.login}: ${err}`);
	}
};

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
		await syncUser(user);
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
