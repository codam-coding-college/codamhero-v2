import Fast42 from '@codam/fast42';
import { syncDataCB } from './base';
import { prisma } from "../handlers/db";
import { INTRA_PISCINE_ASSISTANT_GROUP_ID } from '../env';

export const syncGroups = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const sync = await prisma.synchronization.findFirst({
		where: {
			type: 'groups',
		},
	});

	// We only sync the C.A.T. group (id defined in INTRA_PISCINE_ASSISTANT_GROUP_ID)
	// In the future we might want to sync all groups, but then syncing groups_users will be a pain as there is no campus filter on that endpoint.
	await syncDataCB(api, syncDate, sync?.last_sync_date, `/groups/${INTRA_PISCINE_ASSISTANT_GROUP_ID}`, {}, async (group) => {
		try {
			await prisma.group.upsert({
				where: {
					id: group.id,
				},
				update: {
					name: group.name,
				},
				create: {
					id: group.id,
					name: group.name,
				}
			});
		}
		catch (err) {
			console.error(`Error syncing group ${group.id}: ${err}`);
		}
	});

	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			type: 'groups',
		},
		update: {
			last_sync_date: syncDate,
		},
		create: {
			type: 'groups',
			last_sync_date: syncDate,
		},
	});
};
