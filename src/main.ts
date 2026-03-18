// Load the .env file
import dotenv from 'dotenv';
dotenv.config({ path: '.env', debug: true });

// Imports for the server
import express from 'express';

// Imports for the database connection
import { prisma } from './handlers/db';

// Imports for the Intra API
import Fast42 from '@codam/fast42';
import { INTRA_API_UID, INTRA_API_SECRET } from './env';
import { syncWithIntra, SYNC_INTERVAL } from './intra/base';
const NO_INTRA_SYNC = process.argv.includes('--nosync');
let firstSyncComplete = false;

// Imports for the handlers and routes
import { setupPassport, usePassport } from './handlers/authentication';
import { setupNunjucksFilters } from './handlers/filters';
import { setupExpressMiddleware } from './handlers/middleware';
import { setupHomeRoutes } from './routes/home';
import { setupLoginRoutes } from './routes/login';
import { setupUsersRoutes } from './routes/users';
import { setupPiscinesRoutes } from './routes/piscines';
import { setupDiscoPiscineRoutes } from './routes/disco';
import { setupClustermapRoutes } from './routes/clustermap';
import { buildCPiscineCache } from './handlers/piscine';
import { buildDiscoPiscineCache } from './handlers/disco';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';


// Set up the Express app
const app = express();

// Configure passport for OAuth2 authentication with Intra
setupPassport(prisma);

// Configure custom nunjucks filters for the templating engine
setupNunjucksFilters(app);

// Configure Express to use passport for authentication
usePassport(app);

// Wait for the Intra synchronization to finish before showing any pages on startup
app.use(async function(req: express.Request, res: express.Response, next: express.NextFunction) {
	if (!firstSyncComplete) {
		console.log(`A visitor requested the path ${req.path}, but we haven't finished syncing yet. Showing a waiting page.`);
		res.status(503).render('syncing.njk');
	}
	else {
		next();
	}
});

// Configure the Express app to use specific middleware for each request
setupExpressMiddleware(app);

// Set up all the routes/endpoints for Express
setupHomeRoutes(app, prisma);
setupLoginRoutes(app);
setupUsersRoutes(app, prisma);
setupPiscinesRoutes(app, prisma);
setupDiscoPiscineRoutes(app, prisma);
setupClustermapRoutes(app, prisma);

// Actually start the server and sync with the Intra API
app.listen(4000, async () => {
	console.log('Server is running on http://localhost:4000');

	try {
		console.log('Initializing connection with the Intra API...');
		const api = await new Fast42([{
			client_id: INTRA_API_UID,
			client_secret: INTRA_API_SECRET,
		}]).init();

		if (!NO_INTRA_SYNC) {
			console.log('Syncing with Intra...');
			await syncWithIntra(api);
		}
		firstSyncComplete = true;

		// Schedule a synchronization round every 10 minutes
		if (!NO_INTRA_SYNC) {
			setInterval(async () => {
				console.log(`Synchronization with Intra started at ${new Date().toISOString()}`);
				await syncWithIntra(api);
				console.log(`Synchronization with Intra completed at ${new Date().toISOString()}`);
			}, SYNC_INTERVAL * 60 * 1000);
		}
	}
	catch (err) {
		if (NO_INTRA_SYNC) {
			console.warn('Failed to connect to the Intra API:', err);
			firstSyncComplete = true;
			return;
		}
		console.error('Failed to synchronize with the Intra API:', err);
		process.exit(1);
	}

	// Clear the server-side cache (should not be needed because of the cache rebuilding below)
	// await invalidateAllCache();

	// Rebuild cache for all C Piscines and Discovery Piscines
	// Don't wait for this to finish, as it can take a long time. Serve the site while this is running.
	buildCPiscineCache(prisma);
	buildDiscoPiscineCache(prisma);
});
