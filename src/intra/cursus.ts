import Fast42 from '@codam/fast42';
import { prisma, syncData, fetchMultiple42ApiPages } from './base';
import { CAMPUS_ID } from '../env';

// Cursus IDs we care about
export const CURSUS_IDS = [1, 4, 9, 21];
export const PISCINE_CURSUS_IDS = [4, 9];
export const REGULAR_CURSUS_IDS = [1, 21];

const setupCursuses = async function(): Promise<void> {
	// Set up all cursuses in the database
	// This is hardcoded because the cursuses are not expected to change often

	// 42 (old 42cursus, deprecated)
	await prisma.cursus.upsert({
		where: {
			id: 1,
		},
		update: {},
		create: {
			id: 1,
			name: '42',
			slug: '42',
		},
	});

	// Piscine C (old C piscine, deprecated)
	await prisma.cursus.upsert({
		where: {
			id: 4,
		},
		update: {},
		create: {
			id: 4,
			name: 'Piscine C',
			slug: 'piscine-c',
		},
	});

	// C Piscine (new C piscine)
	await prisma.cursus.upsert({
		where: {
			id: 9,
		},
		update: {},
		create: {
			id: 9,
			name: 'C Piscine',
			slug: 'c-piscine',
		},
	});

	// 21 (new 42cursus)
	await prisma.cursus.upsert({
		where: {
			id: 21,
		},
		update: {},
		create: {
			id: 21,
			name: '42cursus',
			slug: '42cursus',
		},
	});
}

export const syncCursus = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Make sure cursuses exist in the database for relations
	await setupCursuses();

	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'cursus',
		},
	});

	// Fetch all users from the API updated since the last synchronization
	const cursusUsers = await syncData(api, syncDate, syncKind?.last_synced_at, `/cursus_users`, {
		'filter[campus_id]': `${CAMPUS_ID}`,
		'filter[cursus_id]': CURSUS_IDS.join(','),
	});

	// Insert or update each user in the database
	let i = 0;
	const total = cursusUsers.length;

	for (const cursusUser of cursusUsers) {
		console.debug(`Syncing cursus_user ${++i}/${total} (${cursusUser.user.login} - ${cursusUser.cursus.name})...`);

		try {
			await prisma.cursusUser.upsert({
				where: {
					id: cursusUser.id,
				},
				update: {
					begin_at: new Date(cursusUser.begin_at),
					end_at: cursusUser.end_at ? new Date(cursusUser.end_at) : null,
					level: cursusUser.level,
					grade: cursusUser.grade ? cursusUser.grade : null,
					updated_at: new Date(cursusUser.updated_at),
				},
				create: {
					id: cursusUser.id,
					begin_at: new Date(cursusUser.begin_at),
					end_at: cursusUser.end_at ? new Date(cursusUser.end_at) : null,
					level: cursusUser.level,
					grade: cursusUser.grade ? cursusUser.grade : null,
					created_at: new Date(cursusUser.created_at),
					updated_at: new Date(cursusUser.updated_at),
					user: {
						connect: {
							id: cursusUser.user.id,
						},
					},
					cursus: {
						connect: {
							id: cursusUser.cursus.id,
						},
					},
				}
			});
		}
		catch (err) {
			console.error(`Error syncing cursus_user ${cursusUser.user.login} - ${cursusUser.cursus.name}: ${err}`);
		}
	}

	console.log("Checking for ongoing piscine cursuses...");

	// Synchronize each active piscine cursus to fetch the latest levels
	// These are not included in the updated_at range because they are not updated directly in the database
	// and instead calculated by the API server-side...
	const ongoingPiscineCursuses = await prisma.cursusUser.findMany({
		where: {
			begin_at: {
				lte: syncDate,
			},
			end_at: {
				gte: syncDate,
			},
			cursus_id: 9,
		},
	});

	const ongoingPiscineCursusesChunks = [];
	for (let i = 0; i < ongoingPiscineCursuses.length; i += 100) {
		ongoingPiscineCursusesChunks.push(ongoingPiscineCursuses.slice(i, i + 100));
	}
	// Check each chunk with the API and update the level field if needed
	for (const chunk of ongoingPiscineCursusesChunks) {
		const ongoingPiscineCursusesAPI = await fetchMultiple42ApiPages(api, `/cursus_users`, {
			'filter[id]': chunk.map(cursusUser => cursusUser.id).join(','),
		});

		for (const cursusUser of ongoingPiscineCursusesAPI) {
			try {
				await prisma.cursusUser.update({
					where: {
						id: cursusUser.id,
					},
					data: {
						level: cursusUser.level,
						grade: cursusUser.grade ? cursusUser.grade : null,
						updated_at: new Date(cursusUser.updated_at),
					},
				});
			}
			catch (err) {
				console.error(`Error updating cursus_user ${cursusUser.user.login} - ${cursusUser.cursus.name}: ${err}`);
			}
		}

		// Find the cursus_users that were not returned by the API
		// This can happen if a pisciner unregistered from the piscine through Apply
		const missingCursusUsers = chunk.filter(cursusUser => !ongoingPiscineCursusesAPI.find(cursusUserAPI => cursusUserAPI.id === cursusUser.id));
		for (const missingCursusUser of missingCursusUsers) {
			console.warn(`Cursus_user ${missingCursusUser.id} of user ${missingCursusUser.user_id} was not returned by the API. Removing it from the database.`);
			await prisma.cursusUser.delete({
				where: {
					id: missingCursusUser.id,
				},
			});
		}
	}

	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			kind: 'cursus',
		},
		update: {
			last_synced_at: syncDate,
		},
		create: {
			kind: 'cursus',
			first_synced_at: syncDate,
			last_synced_at: syncDate,
		},
	});
};
