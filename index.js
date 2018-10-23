const fs = require('fs');
const luxon = require('luxon');
const minimist = require('minimist');
const path = require('path');
const request = require('request');
const turndown = require('turndown');
const xml2js = require('xml2js');

let argv, turndownService;

function init() {
	argv = minimist(process.argv.slice(2), {
		string: ['input', 'output'],
		boolean: ['yearmonthfolders', 'yearfolders', 'postfolders', 'prefixdate', 'saveimages'],
		default: {
			input: 'export.xml',
			output: 'output',
			yearmonthfolders: false,
			yearfolders: false,
			postfolders: true,
			prefixdate: false,
			saveimages: true
		}
	});

	turndownService = new turndown({
		headingStyle: 'atx',
		bulletListMarker: '-'
	});
	turndownService.keep(['script']);

	let content = readFile(argv.input);
	parseFileContent(content);
}

function readFile(path) {
	try {
		return fs.readFileSync(path, 'utf8');
	} catch (ex) {
		console.log('Unable to read file.');
		console.log(ex.message);
	}
}

function parseFileContent(content) {
	const processors = { tagNameProcessors: [ xml2js.processors.stripPrefix ] };
	xml2js.parseString(content, processors, (err, data) => {
		if (err) {
			console.log('Unable to parse file content.');
			console.log(err);        
		} else {
			processData(data);
		}
	});
}

function processData(data) {
	let images = collectImages(data);
	let posts = collectPosts(data);
	mergeImagesIntoPosts(images, posts);
	writeFiles(posts);
}

function collectImages(data) {
	return getItemsOfType(data, 'attachment')
		.filter(attachment => (/\.(gif|jpg|png)$/i).test(attachment.attachment_url[0]))
		.map(attachment => ({
			id: attachment.post_id[0],
			postId: attachment.post_parent[0],
			url: attachment.attachment_url[0]
		}));	
}

function collectPosts(data) {
	return getItemsOfType(data, 'post')
		.map(post => ({
			meta: {
				id: getPostId(post),
				coverImageId: getPostCoverImageId(post)
			},
			frontmatter: {
				slug: getPostSlug(post),
				title: getPostTitle(post),
				date: getPostDate(post)
			},
			content: getPostContent(post)
		}));
}

function getItemsOfType(data, type) {
	return data.rss.channel[0].item.filter(item => item.post_type[0] === type);
}

function getPostId(post) {
	return post.post_id[0];
}

function getPostCoverImageId(post) {
	let postmeta = post.postmeta.find(postmeta => postmeta.meta_key[0] === '_thumbnail_id');
	let id = postmeta ? postmeta.meta_value[0] : undefined;
	return id;
}

function getPostSlug(post) {
	return post.post_name[0];
}

function getPostTitle(post) {
	return post.title[0];
}

function getPostDate(post) {
	return luxon.DateTime.fromRFC2822(post.pubDate[0], { zone: 'utc' }).toISO();
}

function getPostContent(post) {
	return post.encoded[0].trim();
}

function mergeImagesIntoPosts(images, posts) {
	let postsLookup = posts.reduce((lookup, post) => {
		lookup[post.meta.id] = post;
		return lookup;
	}, {});

	images.forEach(image => {
		let post = postsLookup[image.postId];
		if (post) {
			post.meta.imageUrls = post.meta.imageUrls || [];
			post.meta.imageUrls.push(image.url);

			if (image.id === post.meta.coverImageId) {
				post.meta.coverImageUrl = image.url;
				post.frontmatter.coverImage = getFilenameFromUrl(image.url);
			}
		}
	});
}

function writeFiles(posts) {
	posts.forEach(post => {
		const postDir = getPostDir(post);
		createDir(postDir);
		writeMarkdownFile(post, postDir);

		if (argv.saveimages && post.meta.imageUrls) {
			post.meta.imageUrls.forEach(imageUrl => {
				const imageDir = path.join(postDir, 'images');
				createDir(imageDir);
				writeImageFile(imageUrl, imageDir);
			});
		}
	});
}

function writeMarkdownFile(post, postDir) {
	const frontmatter = Object.entries(post.frontmatter)
		.reduce((accumulator, pair) => {
			return accumulator + pair[0] + ': "' + pair[1] + '"\n'
		}, '');

	const content = turndownService.turndown(post.content)
		.replace(/-\s+/g, '- ')
		.replace(/\s*(<script[^>]*>.*?<\/script>)\s*/g, '\n\n$1\n\n');
	
	const data = '---\n' + frontmatter + '---\n\n' + content + '\n';
	
	const postPath = path.join(postDir, getPostFilename(post));
	fs.writeFile(postPath, data, (err) => {
		if (err) {
			console.log('Unable to write file.')
			console.log(err);
		} else {
			console.log('Wrote ' + postPath + '.');
		}
	});
}

function writeImageFile(imageUrl, imageDir) {
	let imagePath = path.join(imageDir, getFilenameFromUrl(imageUrl));
		let stream = fs.createWriteStream(imagePath);
		stream.on('finish', () => {
			console.log('Saved ' + imagePath + '.');
		});

		request
			.get(imageUrl)
			.on('response', response => {
				if (response.statusCode !== 200) {
					console.log('Response status code ' + response.statusCode + ' received for ' + imageUrl + '.');
				}
			})
			.on('error', err => {
				console.log('Unable to download image.');
				console.log(err);
			})
			.pipe(stream);
}

function getFilenameFromUrl(url) {
	return url.split('/').slice(-1)[0];
}

function createDir(dir) {
	try {
		fs.accessSync(dir, fs.constants.F_OK);
	} catch (ex) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function getPostDir(post) {
	let dir = argv.output;
	let dt = luxon.DateTime.fromISO(post.frontmatter.date);

	if (argv.yearmonthfolders) {
		dir = path.join(dir, dt.toFormat('yyyy'), dt.toFormat('LL'));
	} else if (argv.yearfolders) {
		dir = path.join(dir, dt.toFormat('yyyy'));
	}

	if (argv.postfolders) {
		let folder = post.frontmatter.slug;
		if (argv.prefixdate) {
			folder = dt.toFormat('yyyy-LL-dd') + '-' + folder;
		}
		dir = path.join(dir, folder);
	}

	return dir;
}

function getPostFilename(post) {
	if (argv.postfolders) {
		return 'index.md';
	} else {
		let filename = post.frontmatter.slug + '.md';
		if (argv.prefixdate) {
			let dt = luxon.DateTime.fromISO(post.frontmatter.date);
			filename = dt.toFormat('yyyy-LL-dd') + '-' + filename;
		}
		return filename;
	}
}

init();
