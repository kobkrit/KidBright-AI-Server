const drivelist = require('drivelist');

const drives = drivelist.list();
drives.then((result) => {
	console.log(result[0].mountpoints)
})

