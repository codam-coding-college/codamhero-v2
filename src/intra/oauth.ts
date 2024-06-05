import https from 'https';

export interface IntraUser extends Express.User {
	id: number;
	email: string;
	login: string;
	first_name: string;
	last_name: string;
	usual_first_name: string | null;
	usual_full_name: string;
	display_name: string;
	kind: string;
	image_url: string | null;
};

export const authenticate = async function(accessToken: string): Promise<IntraUser> {
	try {
		const me = await new Promise<any>((resolve, reject) => {
			const req = https.get('https://api.intra.42.fr/v2/me', {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
				},
			}, (res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					resolve(JSON.parse(data));
				});
			});
			req.on('error', (err) => {
				reject(err);
			});
		});

		const user: IntraUser = {
			id: me.id,
			email: me.email,
			login: me.login,
			first_name: me.first_name,
			last_name: me.last_name,
			usual_first_name: me.usual_first_name,
			usual_full_name: me.usual_full_name,
			display_name: me.displayname,
			kind: me.kind,
			image_url: (me.image && me.image.link ? me.image.versions.medium : null),
		};

		return user;
	}
	catch (err) {
		throw new Error(`Failed to authenticate: ${err}`);
	}
};
