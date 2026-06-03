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

// Codam cursus taxonomy used to classify users on the clustermap.
// Kept here (server-side) so the wire format stays a single opaque `grade` string.
const PISCINE_CURSUS_ID = 9;
const CORE_CURSUS_ID = 21;
const GRADE_TRANSCENDER = 'Transcender';
const GRADE_ALUMNI = 'Alumni';

export type UserGrade = 'pisciner' | 'advanced' | 'alumni' | null;

type RawCursusUser = {
	cursus_id: number;
	level: number;
	grade: string | null;
	end_at: Date | null;
};

// Derive a single category label from a user's cursus_users rows.
// Order matters: an ongoing piscine wins over advanced/alumni status on the core cursus.
// In practice, finishing the advanced cursus before the piscine ends shouldn't happen.
const deriveUserGrade = function(cursusUsers: RawCursusUser[]): UserGrade {
	const now = new Date();
	if (cursusUsers.some(cu => cu.cursus_id === PISCINE_CURSUS_ID && cu.end_at !== null && new Date(cu.end_at) > now)) {
		return 'pisciner';
	}
	if (cursusUsers.some(cu => cu.cursus_id === CORE_CURSUS_ID && cu.grade === GRADE_TRANSCENDER)) {
		return 'advanced';
	}
	if (cursusUsers.some(cu => cu.cursus_id === CORE_CURSUS_ID && cu.grade === GRADE_ALUMNI)) {
		return 'alumni';
	}
	return null;
};

const CLUSTERMAP_USER_SELECT = {
	id: true,
	login: true,
	display_name: true,
	image: true,
	cursus_users: {
		select: {
			cursus_id: true,
			level: true,
			grade: true,
			end_at: true,
		},
	},
};

const CLUSTERMAP_LOCATION_SELECTS = {
	id: true,
	begin_at: true,
	end_at: true,
	host: true,
	user: {
		select: CLUSTERMAP_USER_SELECT,
	},
};

type RawClustermapUser = {
	id: number;
	login: string;
	display_name: string;
	image: string | null;
	cursus_users: RawCursusUser[];
};

export interface ClustermapUser {
	id: number;
	login: string;
	display_name: string;
	image: string | null;
	grade: UserGrade;
};

// Strip the raw cursus_users array from the wire format and replace it with the
// derived grade label. Saves ~80–150 bytes per user on every SSE tick / history fetch.
const enrichUser = function(user: RawClustermapUser): ClustermapUser {
	return {
		id: user.id,
		login: user.login,
		display_name: user.display_name,
		image: user.image,
		grade: deriveUserGrade(user.cursus_users),
	};
};

type RawClustermapLocation = {
	id: number;
	begin_at: Date;
	end_at: Date | null;
	host: string;
	user: RawClustermapUser;
};

const enrichLocation = function(location: RawClustermapLocation): ClustermapLocation {
	return {
		id: location.id,
		begin_at: location.begin_at,
		end_at: location.end_at,
		host: location.host,
		user: enrichUser(location.user),
	};
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
	const locations = await prisma.location.findMany({
		where: {
			end_at: null,
		},
		select: CLUSTERMAP_LOCATION_SELECTS,
	}) as RawClustermapLocation[];
	return locations.map(enrichLocation);
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
		const locations = await prisma.location.findMany({
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
			select: CLUSTERMAP_LOCATION_SELECTS,
		}) as RawClustermapLocation[];

		return res.json(locations.map(enrichLocation));
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
		const rawUsers = await prisma.user.findMany({
			where: {
				id: {
					in: locations.map(location => location.user_id),
				},
			},
			select: CLUSTERMAP_USER_SELECT,
		}) as RawClustermapUser[];

		const data: {
			users: ClustermapUser[],
			locations: ClustermapHistoricalLocation[],
		} = {
			users: rawUsers.map(enrichUser),
			locations,
		};
		return res.json(data);
	});
};
