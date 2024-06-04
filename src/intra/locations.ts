import Fast42 from '@codam/fast42';
import { prisma, syncDataCB, CAMPUS_ID, fetchMultiple42ApiPages } from './base';

export const syncLocations = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'locations',
		},
	});

	await syncDataCB(api, syncDate, syncKind?.last_synced_at, `/campus/${CAMPUS_ID}/locations`, {}, async (locations) => {
		for (const location of locations) {
			console.debug(`Syncing a location (${location.user.login} on ${location.host} - ${location.begin_at})...`);

			try {
				await prisma.location.upsert({
					where: {
						id: location.id,
					},
					update: {
						primary: typeof location.primary === "boolean" ? location.primary : true,
						host: location.host,
						begin_at: new Date(location.begin_at),
						end_at: location.end_at ? new Date(location.end_at) : null
					},
					create: {
						id: location.id,
						primary: typeof location.primary === "boolean" ? location.primary : true,
						host: location.host,
						begin_at: new Date(location.begin_at),
						end_at: location.end_at ? new Date(location.end_at) : null,
						user: {
							connect: {
								id: location.user.id,
							},
						},
					}
				});
			}
			catch (err) {
				console.error(`Error syncing location ${location.id} of ${location.user.login} on ${location.host} at ${location.begin_at}: ${err}`);
			}
		}
	});

	console.log('Checking for ended locally ongoing locations...');

	// Retrieve all ongoing locations and check if they're still ongoing with the API
	const ongoingLocations = await prisma.location.findMany({
		where: {
			end_at: null,
		},
	});

	const ongoingLocationsChunks = [];
	for (let i = 0; i < ongoingLocations.length; i += 100) {
		ongoingLocationsChunks.push(ongoingLocations.slice(i, i + 100));
	}
	// Check each chunk with the API and updated the end_at field if needed
	for (const chunk of ongoingLocationsChunks) {
		const ongoingLocationsAPI = await fetchMultiple42ApiPages(api, `/locations`, {
			'filter[id]': chunk.map(location => location.id).join(','),
		});

		for (const location of ongoingLocationsAPI) {
			try {
				await prisma.location.update({
					where: {
						id: location.id,
					},
					data: {
						primary: typeof location.primary === "boolean" ? location.primary : true,
						host: location.host,
						end_at: location.end_at ? new Date(location.end_at) : null,
					}
				});
			}
			catch (err) {
				console.error(`Error updating location ${location.id} of ${location.user.login} on ${location.host} at ${location.begin_at}: ${err}`);
			}
		}
	}

	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			kind: 'locations',
		},
		update: {
			last_synced_at: syncDate,
		},
		create: {
			kind: 'locations',
			first_synced_at: syncDate,
			last_synced_at: syncDate,
		},
	});
};
