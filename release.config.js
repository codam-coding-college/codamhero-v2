module.exports = {
	branches: ["master"],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release-plus/docker",
			{
				name: "ghcr.io/codam-coding-college/codamhero-v2",
				skipLogin: true,
			},
		],
		"@semantic-release/github",
	]
};
