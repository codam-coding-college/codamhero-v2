export interface Logtimes {
	total: number; // in seconds
};

export interface Stat {
	label: string;
	value: number | string;
	unit: string | null;
};

// TODO: define the types for the data explicitly
export interface UserListData {
	users: any[];
	stats: Stat[];
	logtimes: { [login: string]: Logtimes };
	dropouts: { [login: string]: boolean };
	projects: any[];
};
