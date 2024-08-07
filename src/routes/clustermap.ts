import path from 'path';
import { promises as fs } from 'fs';
import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';

// Get the clustermaps from the static folder
const getClustermaps = async function(): Promise<string[]> {
	let files = await fs.readdir(path.join(__dirname, '..', '..', 'static', 'images', 'clustermaps'));
	// Filter out non-svg files and prepend the path to the images
	return files.filter(file => file.endsWith('.svg')).map(file => `/images/clustermaps/${file}`);
};

export interface ClustermapUser {
	id: number;
	login: string;
	display_name: string;
	image: string | null;
};

export interface ClustermapLocation {
	id: number;
	begin_at: Date;
	end_at: Date | null;
	host: string;
	user: ClustermapUser;
};

export interface ClustermapHistoricalLocation {
	id: number;
	begin_at: Date;
	end_at: Date | null;
	host: string;
	user_id: number;
};

// Get live locations from the database
const getLiveLocations = async function(prisma: PrismaClient): Promise<ClustermapLocation[]> {
	const locations: ClustermapLocation[] = await prisma.location.findMany({
		where: {
			end_at: null,
		},
		select: {
			id: true,
			begin_at: true,
			end_at: true,
			host: true,
			user: {
				select: {
					id: true,
					login: true,
					display_name: true,
					image: true,
				},
			}
		},
	});
	return locations;
};

const filterUpdatedLocations = function(oldLocations: ClustermapLocation[] | null, newLocations: ClustermapLocation[]) {
	if (!oldLocations) {
		return {
			"added": newLocations,
			"removed": [],
		};
	}
	const oldIDs = oldLocations.map(location => location.id);
	const newIDs = newLocations.map(location => location.id);
	const added = newLocations.filter(location => !oldIDs.includes(location.id));
	const removed = oldLocations.filter(location => !newIDs.includes(location.id));
	return {
		"added": added,
		"removed": removed,
	};
};

export const setupClustermapRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/clustermap', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		// Redirect to live clustermap but keep the hash if there is one
		const hash = req.url.indexOf('#') === -1 ? '' : req.url.slice(req.url.indexOf('#'));
		res.redirect(`/clustermap/live${hash}`);
	});

	app.get('/clustermap/live', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		const clustermaps = await getClustermaps();
		return res.render('clustermap.njk', { version: "live", clustermaps });
	});

	app.get('/clustermap/history', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		const clustermaps = await getClustermaps();
		const date_preset = new Date(Date.now() - 24 * 60 * 60 * 1000);
		return res.render('clustermap.njk', {
			version: "history",
			clustermaps,
			date_preset: {
				local: date_preset.toISOString().slice(0, 16),
			},
		});
	});

	app.get('/clustermap/playback', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		const clustermaps = await getClustermaps();

		// Date preset (default to 7 days)
		const now = new Date();
		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		return res.render('clustermap.njk', {
			version: "playback",
			clustermaps,
			date_preset: {
				start: weekAgo.toISOString().slice(0, 10),
				end: now.toISOString().slice(0, 10),
			}
		});
	});

	app.get('/clustermap/locations/live', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		// Start a Server Side Event stream
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no');

		// Get initial data
		let liveLocations = await getLiveLocations(prisma);

		// Send updated data every 30 seconds
		const interval = setInterval(async () => {
			const newLocations = await getLiveLocations(prisma);
			const data = filterUpdatedLocations(liveLocations, newLocations);
			res.write('event: update\n');
			res.write(`id: ${Date.now()}\n`);
			res.write(`data: ${JSON.stringify(data)}\n\n`);
			liveLocations = newLocations;
		}, 30000);

		// Send the first data immediately
		res.write('event: update\n');
		res.write(`id: ${Date.now()}\n`);
		res.write(`data: ${JSON.stringify(filterUpdatedLocations(null, liveLocations))}\n\n`);

		// Stop the interval when the connection is closed
		req.on('close', () => {
			clearInterval(interval);
			res.end();
		});
	});

	app.get('/clustermap/locations/:at', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		// Parse the date
		const at = new Date(req.params.at);
		if (isNaN(at.getTime())) {
			return res.status(400).send("Invalid date format");
		}

		// Get the locations from the database
		const locations: ClustermapLocation[] = await prisma.location.findMany({
			where: {
				OR: [
					{
						begin_at: {
							lte: at,
						},
						end_at: {
							gte: at,
						},
					},
					{
						begin_at: {
							lte: at,
						},
						end_at: null,
					},
				],
			},
			select: {
				id: true,
				begin_at: true,
				end_at: true,
				host: true,
				user: {
					select: {
						id: true,
						login: true,
						display_name: true,
						image: true,
					},
				}
			},
		});

		return res.json(locations);
	});

	app.get('/clustermap/locations/:from/:to', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		// Parse the from and to dates
		const from = new Date(req.params.from);
		const to = new Date(new Date(req.params.to).getTime() + 24 * 60 * 60 * 1000);
		if (isNaN(from.getTime()) || isNaN(to.getTime())) {
			return res.status(400).send("Invalid date format");
		}

		// If the from date is after the to date, send a 400
		if (from > to) {
			return res.status(400).send("Invalid date range");
		}

		// Check if more than 31 days requested
		const diff = to.getTime() - from.getTime();
		if (diff > 31 * 24 * 60 * 60 * 1000) {
			return res.status(400).send("Date range too large");
		}

		// Get the locations from the database
		const locations: ClustermapHistoricalLocation[] = await prisma.location.findMany({
			where: {
				OR: [
					{
						begin_at: {
							gte: from,
							lte: to,
						},
					},
					{
						end_at: {
							gte: from,
							lte: to,
						},
					},
					{
						begin_at: {
							gte: from,
							lte: to,
						},
						end_at: null
					},
				],
			},
			select: {
				id: true,
				begin_at: true,
				end_at: true,
				host: true,
				user_id: true,
			},
		});

		// Get the users for the locations
		const users: ClustermapUser[] = await prisma.user.findMany({
			where: {
				id: {
					in: locations.map(location => location.user_id),
				},
			},
			select: {
				id: true,
				login: true,
				display_name: true,
				image: true,
			},
		});

		const data: {
			users: ClustermapUser[],
			locations: ClustermapHistoricalLocation[],
		} = {
			users,
			locations
		};
		return res.json(data);
	});
};
