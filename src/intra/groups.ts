import Fast42 from '@codam/fast42';
import { prisma, syncDataCB } from './base';
import { INTRA_PISCINE_ASSISTANT_GROUP_ID } from '../env';

export const syncGroups = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'groups',
		},
	});

	// We only sync the C.A.T. group (id defined in INTRA_PISCINE_ASSISTANT_GROUP_ID)
	// In the future we might want to sync all groups, but then syncing groups_users will be a pain as there is no campus filter on that endpoint.
	await syncDataCB(api, syncDate, syncKind?.last_synced_at, `/groups/${INTRA_PISCINE_ASSISTANT_GROUP_ID}`, {}, async (group) => {
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
			kind: 'groups',
		},
		update: {
			last_synced_at: syncDate,
		},
		create: {
			kind: 'groups',
			first_synced_at: syncDate,
			last_synced_at: syncDate,
		},
	});
};
