import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';

export const setupHomeRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/', passport.authenticate('session', {
		keepSessionInfo: true,
	}), async (req, res) => {
		// Fetch last synchronization times from the database
		const syncTimes = await prisma.synchronization.findMany({
			orderBy: [
				{ kind: 'asc' },
			],
		});

		return res.render('index.njk', { syncTimes });
	});
};
