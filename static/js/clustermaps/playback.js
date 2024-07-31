const dateStartSelector = document.getElementById('history-date-start-selector');
const dateEndSelector = document.getElementById('history-date-end-selector');
const playbackSpeedSelector = document.getElementById('history-playback-speed-selector');
const playbackRange = document.getElementById('history-playback-range');
const playbackCurTime = document.getElementById('history-playback-range-value');
const playbackButton = document.getElementById('history-playback-button');

let locationData = {};
let currentTimestamp = 0;
let lastActiveLocations = [];
let playbackFrameRate = 4; // frames per second
let playbackSpeed = parseInt(playbackSpeedSelector.value); // minutes
let isPlaying = false;
let isFetching = false;

async function fetchLocationData() {
	isFetching = true;
	const from = dateStartSelector.value;
	const to = dateEndSelector.value;
	const req = await fetch(`/clustermap/locations/${from}/${to}`);
	const data = await req.json();
	locationData = data;
	console.log("Fetched location data", locationData);

	// Set range input min and max values
	playbackRange.min = new Date(from).getTime();
	playbackRange.max = new Date(to).getTime();
	currentTimestamp = parseInt(playbackRange.min);
	isFetching = false;
}

function draw() {
	if (!isPlaying || isFetching || currentTimestamp > parseInt(playbackRange.max)) {
		return;
	}

	// Find locations that are active at the current timestamp
	const activeLocations = locationData.locations.filter(location => {
		const beginAt = new Date(location.begin_at).getTime();
		const endAt = new Date(location.end_at).getTime();
		return beginAt <= currentTimestamp && endAt >= currentTimestamp;
	});
	const updatedLocations = filterUpdatedLocations(lastActiveLocations, activeLocations);
	lastActiveLocations = activeLocations;
	for (const removedLocation of updatedLocations["removed"]) {
		const user = locationData.users.find(user => user.id === removedLocation.user_id);
		removeLocation({
			begin_at: removedLocation.begin_at,
			end_at: removedLocation.end_at,
			host: removedLocation.host,
			user: {
				login: user.login,
				display_name: user.display_name,
				image: user.image,
			},
		});
	}
	for (const newLocation of updatedLocations["added"]) {
		const user = locationData.users.find(user => user.id === newLocation.user_id);
		createLocation({
			begin_at: newLocation.begin_at,
			end_at: newLocation.end_at,
			host: newLocation.host,
			user: {
				login: user.login,
				display_name: user.display_name,
				image: user.image,
			},
		});
	}

	// Schedule next frame drawing
	currentTimestamp += playbackSpeed * 60 * 1000 / playbackFrameRate;
	playbackRange.value = currentTimestamp;
	playbackCurTime.innerText = new Date(currentTimestamp).toLocaleString();
	setTimeout(draw, 1000 / playbackFrameRate);
}

// On date start or end selector change, fetch new data
dateStartSelector.addEventListener('change', fetchLocationData);
dateEndSelector.addEventListener('change', fetchLocationData);

// On playback speed selector change, update playback speed
playbackSpeedSelector.addEventListener('change', () => {
	playbackSpeed = parseInt(playbackSpeedSelector.value);
});

// On playback range change, update current timestamp
playbackRange.addEventListener('input', () => {
	currentTimestamp = parseInt(playbackRange.value);
});

// On playback button click, toggle playback
playbackButton.addEventListener('click', () => {
	isPlaying = !isPlaying;
	if (isPlaying) {
		playbackButton.textContent = 'Pause';
		draw();
	} else {
		playbackButton.textContent = 'Play';
	}
});

// Get initial data
fetchLocationData();
