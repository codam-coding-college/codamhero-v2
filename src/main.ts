// Load the .env file
import dotenv from 'dotenv';
dotenv.config({ path: '.env', debug: true });

// Imports for the server
import express from 'express';

// Imports for the database connection
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Imports for the Intra API
import Fast42 from '@codam/fast42';
import { INTRA_API_UID, INTRA_API_SECRET } from './env';
import { syncWithIntra } from './intra/base';
let firstSyncComplete = false;

// Imports for the handlers and routes
import { setupPassport, usePassport } from './handlers/authentication';
import { setupNunjucksFilters } from './handlers/filters';
import { setupExpressMiddleware } from './handlers/middleware';
import { setupHomeRoutes } from './routes/home';
import { setupLoginRoutes } from './routes/login';
import { setupUsersRoutes } from './routes/users';
import { setupPiscinesRoutes } from './routes/piscines';


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
		res.render('syncing.njk');
		res.status(503);
	}
	else {
		next();
	}
});

// Configure the Express app to use specific middleware for each request
setupExpressMiddleware(app);

// Set up all the routes/endpoints for Express
setupHomeRoutes(app);
setupLoginRoutes(app);
setupUsersRoutes(app, prisma);
setupPiscinesRoutes(app, prisma);

// Actually start the server and sync with the Intra API
app.listen(3000, async () => {
	console.log('Server is running on http://localhost:3000');

	console.log('Syncing with Intra...');
	try {
		const api = await new Fast42([{
			client_id: INTRA_API_UID,
			client_secret: INTRA_API_SECRET,
		}]).init();

		await syncWithIntra(api);
		firstSyncComplete = true;
	}
	catch (err) {
		console.error('Failed to synchronize with the Intra API:', err);
		process.exit(1);
	}
});
