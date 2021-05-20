var express = require('express')
var cors = require('cors')
var app = express()
var rimraf = require('rimraf')
const { spawn, exec } = require('child_process')

var nodeDir = __dirname
// var clientPublicDir = '/nectec-client/public'
var clientPublicDir = '/nectec-client/dist'
var projectDir = '/pro1'
var imageDir = '/images'
var audioDir = '/audios'

const testFolder = nodeDir + clientPublicDir + projectDir + imageDir
const fs = require('fs')
var http = require('http')
const path = require('path')
var convert = require('xml-js')
var archiver = require('archiver')
var streamBuffers = require('stream-buffers')
var tar = require('tar')
var zlib = require('zlib')
const multer = require('multer')
const upload = multer()
var _ = require('lodash')
var ip = require('ip')
var usbDetect = require('usb-detection')
var parser = require('xml2json')
const du = require('du')
var rimraf = require('rimraf')
var wifi = require('node-wifi')
var request = require('request');

// Initialize wifi module
// Absolutely necessary even to set interface to null
wifi.init({
  iface: null, // network interface, choose a random wifi interface if set to null
})

const low = require('lowdb')
const FileAsync = require('lowdb/adapters/FileAsync')
// Require rosnodejs itself
const rosnodejs = require('rosnodejs');
// Requires the std_msgs message package
const std_msgs = rosnodejs.require('std_msgs').msg;

rosnodejs.initNode('/server_stdio')
const nh = rosnodejs.nh;
let std_out_pub = nh.advertise('/std_out', std_msgs.String);
let std_out_python_pub = nh.advertise('/std_out_python', std_msgs.String);
let std_done_pub = nh.advertise('/std_done', std_msgs.String);
const std_out_msg = new std_msgs.String();

usbDetect.startMonitoring()

usbDetect.on('add', function (device) {
  console.log('add', device)
  setTimeout(() => {
    const child = spawn('sh', ['-c', `df -h | grep ${usbDrive}`])
    child.stdout.on('data', (data) => {
      const regex = /\/dev\/sda1/g
      console.log(`stdout: ${data}`)
      if (regex.test(data.toString())) {
        exec(`sudo mount ${usbDrive} /media/usb -o uid=pi,gid=pi`, (err) => {
          if (err) {
            console.error(err)
          } else {
            console.log(`usb drive is mounted.`)
          }
        })
      }
    })
    child.stderr.on('data', (data) => {
      console.error(`stderr:\n${data}`)
    })
  }, 5000)
})

nodeDir = nodeDir.substr(0, nodeDir.lastIndexOf('/'))

var bodyParser = require('body-parser')
const drivelist = require('drivelist')

app.use(
  bodyParser.json({
    limit: '50mb',
  }),
)
app.use(
  bodyParser.urlencoded({
    limit: '50mb',
    extended: true,
    parameterLimit: 50000,
  }),
)

function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const sep = path.sep
  const initDir = path.isAbsolute(targetDir) ? sep : ''
  const baseDir = isRelativeToScript ? __dirname : '.'

  return targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir)
    try {
      fs.mkdirSync(curDir)
    } catch (err) {
      if (err.code === 'EEXIST') {
        // curDir already exists!
        return curDir
      }

      // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
      if (err.code === 'ENOENT') {
        // Throw the original parentDir error on curDir `ENOENT` failure.
        throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`)
      }

      const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1
      if (!caughtErr || (caughtErr && curDir === path.resolve(targetDir))) {
        throw err // Throw if it's just the last created dir.
      }
    }

    return curDir
  }, initDir)
}

const isProjecDirectory = (source) =>
  fs.lstatSync(source).isDirectory() &&
  fs.existsSync(path.join(source, 'project.xml'))
const isNotHidden = (name) => !/(^|\/)\.[^\/\.]/g.test(name)

const isTypeProjDir = (source, type) => {
  if (isProjecDirectory(source)) {
    const data = fs.readFileSync(path.join(source, 'project.xml'), { encoding: 'utf-8' })
    var jsonString = convert.xml2json(data, optionsProj)
    const json = JSON.parse(jsonString)
    return json.Project._attributes.Type === type
  }
  return false
}

const getDirectoryName = (path) => _.last(path.split('/'))
const getDirectories = (source, type) =>
  fs
    .readdirSync(source)
    .filter(isNotHidden)
    .map((name) => path.join(source, name))
    .filter((source) => isTypeProjDir(source, type))

const isClassesDirectory = (source) => fs.lstatSync(source).isDirectory()
const getClassDirectories = (source) =>
  fs
    .readdirSync(source)
    .filter(isNotHidden)
    .map((name) => path.join(source, name))
    .filter(isClassesDirectory)

var mountPoint = ''
const usbDrive = '/dev/sda1'

function nativeType(value) {
  var nValue = Number(value);
  if (!isNaN(nValue)) {
    return nValue;
  }
  var bValue = value.toLowerCase();
  if (bValue === 'true') {
    return true;
  } else if (bValue === 'false') {
    return false;
  }
  return value;
}

var removeJsonTextAttribute = function (value, parentElement) {
  try {
    var keyNo = Object.keys(parentElement._parent).length;
    var keyName = Object.keys(parentElement._parent)[keyNo - 1];
    parentElement._parent[keyName] = nativeType(value);
  } catch (e) { }
}

var options = {
  compact: true,
  trim: true,
  ignoreDeclaration: true,
  ignoreInstruction: true,
  ignoreAttributes: true,
  ignoreComment: true,
  ignoreCdata: true,
  ignoreDoctype: true,
  textFn: removeJsonTextAttribute
};


var optionsProj = {
  compact: true,
  trim: true,
  ignoreDeclaration: true,
  ignoreInstruction: true,
};

app.use(cors())

app.get('/getDirectories', function (req, res) {
  const regex = /exfat/g
  exec(`sudo blkid ${usbDrive}`, (err, stdout, stderr) => {
    if (err) {
      //some err occurred
      console.error(err)
      return res.status(500).send(err)
    } else {
      console.log(`stdout: ${stdout}`)
      if (!regex.test(stdout)) {
        return res.json({
          status: 'error',
          message: 'Unwriteable, Please format to exFAT.',
        })
      }
      var directories = getDirectories(mountPoint).map(getDirectoryName)
      console.log(directories)
      console.log(`stderr: ${stderr}`)
      return res.json({
        status: 'success',
        message: 'Successfully get directories from usb drive.',
        data: directories,
      })
    }
  })
})

const getAvailableSpace = () => {
  return new Promise((resolve, reject) =>
    //exec('df -k /dev/mmcblk1p7', (err, stdout, stderr) => {
    exec('df -k /dev/sda1', (err, stdout, stderr) => {
      if (err) {
        //some err occurred
        console.error(err)
        reject(err)
      } else {
        const regex = /\d+/gm
        console.log(`stdout: ${stdout}`)
        const matches = stdout.match(regex)
        if (matches.length > 0) {
          resolve(1024 * Number(_.nth(matches, -2)))
        } else {
          resolve(0)
        }
        console.log(`stderr: ${stderr}`)
      }
    }),
  )
}

app.post('/loadFromUSB', async function (req, res) {
  const toPath = path.join(nodeDir, clientPublicDir)
  var fromPath = path.join(mountPoint, req.body.projectName)
  const availableSpace = await getAvailableSpace()
  console.log('availableSpace => ', availableSpace)
  const projectSize = await new Promise((resolve, reject) =>
    exec(`du -s ${fromPath}`, (err, stdout, stderr) => {
      if (err) {
        //some err occurred
        console.error(err)
        reject(err)
      } else {
        const regex = /\d+/g
        console.log(`stdout: ${stdout}`)
        const matches = stdout.match(regex)
        if (matches.length > 0) {
          resolve(Number(_.first(matches)))
        } else {
          resolve(0)
        }
        console.log(`stderr: ${stderr}`)
      }
    }),
  )
  console.log('projectSize => ', projectSize)
  if (projectSize > availableSpace) {
    res.json({
      status: 'error',
      message: 'Insufficient space! Cannot load project.',
    })
  } else {
    console.log('All paths')
    console.log(fromPath)
    console.log(toPath)
    exec(`cp -fR ${fromPath} ${toPath}`, (err, stdout, stderr) => {
      if (err) {
        //some err occurred
        console.error(err)
        res.status(500).send(err)
      } else {
        console.log(`stdout: ${stdout}`)
        console.log(`stderr: ${stderr}`)
        res.json({
          status: 'success',
          message: 'Successfully loaded to storage.',
        })
      }
    })
  }
})

app.post('/loadALLFromUSB', async function (req, res) {
  var toPath = path.join(nodeDir, clientPublicDir)
  var fromPath = mountPoint
  var availableSpace = await getAvailableSpace()
  console.log('from path => ', fromPath)

  var projects = getDirectories(fromPath)
  console.log(projects)
  let projectsTotalSize = 0
  for (const project of projects) {
    let size = await du(project)
    console.log(size)
    projectsTotalSize += size
  }
  console.log('projectsTotalSize => ', projectsTotalSize)
  if (projectsTotalSize > availableSpace) {
    return res.json({
      status: 'error',
      message: 'Insufficient space! Cannot load project.',
    })
  } else {
    const source = projects.join(' ')
    console.log('All paths')
    console.log(fromPath)
    console.log(toPath)
    for (const project of projects) {
      console.log(`cp -fR ${project} ${toPath}`)
      exec(`cp -fR ${project} ${toPath}`, (err, stdout, stderr) => {
        if (err) {
          //some err occurred
          console.error(err)
          return res.status(500).send(err)
        } else {
          console.log(`stdout: ${stdout}`)
          console.log(`stderr: ${stderr}`)
        }
      })
    }
    return res.json({
      status: 'success',
      message: 'Successfully loaded to storage.',
    })
  }
})

app.post('/saveToUSB', function (req, res) {
  var toPath = path.join(mountPoint)
  var fromPath = path.join(nodeDir, clientPublicDir, req.body.projectName)
  exec(`cp -fR ${fromPath} ${toPath}`, (err, stdout, stderr) => {
    if (err) {
      //some err occurred
      console.error(err)
      res.status(500).send(err)
    } else {
      // the *entire* stdout and stderr (buffered)
      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      res.json({
        status: 'success',
        message: 'Successfully saved to USB.',
      })
    }
  })
})

app.post('/ejectUSB', function (req, res) {
  exec(`sudo eject ${usbDrive}`, (err, stdout, stderr) => {
    if (err) {
      //some err occurred
      console.error(err)
      res.status(500).send(err)
    } else {
      // the *entire* stdout and stderr (buffered)
      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      res.json({
        status: 'success',
        message: 'Successfully eject an USB.',
      })
    }
  })
})

app.get('/getClassesLabel/:projectName', function (req, res) {
  const path =
    nodeDir + `${clientPublicDir}/` + req.params.projectName + '/classes.json'
  fs.readFile(path, (err, data) => {
    if (err) return res.status(500).send(err)
    if (!data) return res.status(500)
    else {
      let classes = JSON.parse(data)
      res.json(classes)
    }
  })
})

app.post('/saveClassesLabel/:projectName', function (req, res) {
  const path =
    nodeDir + `${clientPublicDir}/` + req.params.projectName + '/classes.json'
  let data = JSON.stringify(req.body, null, 2)
  fs.writeFile(path, data, (err) => {
    if (err)
      res.json({
        status: 'error',
        message: 'Something went wrong, cannot save classes label.',
      })
    res.json({
      status: 'success',
      message: 'Successfully save classes label.',
    })
  })
})

app.get('/archiveForClassify/:projectName', async function (req, res, next) {
  var zip = new require('node-zip')()
  const pathClasses = path.join(nodeDir, clientPublicDir, req.params.projectName, '/imclass.json')
  fs.readFile(pathClasses, (err, data) => {
    if (err) return res.status(404).send()
    if (!data) return res.status(404).send()
    else {
      let classes = JSON.parse(data)
      const pathImages = path.join(nodeDir, clientPublicDir, req.params.projectName, '/images/')
      classes.annotations.forEach((item) => {
        zip.file(
          `images/${item.class}/${item.file}`,
          fs.readFileSync(path.join(pathImages, item.file)),
        )
      })
      const trainingSet = zip.generate({
        base64: false,
        compression: 'DEFLATE',
      })
      const pathZip = path.join(
        nodeDir,
        clientPublicDir,
        req.params.projectName,
        'images.zip')
      fs.writeFileSync(pathZip, trainingSet, 'binary')
      res.json({ message: 'Zipped successfully.', path: pathZip })
    }
  })
})

app.post('/downloadClassifier', function (req, res) {
  const dest =
    nodeDir +
    `${clientPublicDir}/` +
    req.body.projectName +
    '/retrained_model_edgetpu.tflite'
  var file = fs.createWriteStream(dest)
  http
    .get('http://127.0.0.1:8001/download', function (response) {
      response.pipe(file)
      file.on('finish', function () {
        file.close(() => {
          res.json({
            status: 'success',
            message: 'Successfully download file.',
          })
        })
      })
    })
    .on('error', function (err) {
      fs.unlink(dest)
      console.error(err)
      res.status(500)
    })
})

app.get('/img/:proj', function (req, res, next) {
  var allFiles = []
  var xmlAnnotate = {}


  if (req.query.xmlAnnotate === 'true') {
    // read xml and count classes here
    // if no xml or count === 0 means not annotate

    var impath = path.join(nodeDir, clientPublicDir, req.params.proj, 'images')
    fs.readdir(impath, (err, files) => {
      files.forEach((file, i) => {
        const ext = path.extname(file)
        if (ext === '.xml') {
          const data = fs.readFileSync(path.join(impath, file), { encoding: 'utf-8' })
          var jsonString = convert.xml2json(data, options)
          const json = JSON.parse(jsonString)
          const obj = json.annotation.object
          if (Array.isArray(obj)) {
            xmlAnnotate = Object.assign(xmlAnnotate, { [path.basename(file, ext)]: obj.length })
          } else {
            xmlAnnotate = Object.assign(xmlAnnotate, { [path.basename(file, ext)]: 1 })
          }
        } else {
          allFiles.push({
            file: file,
            id: i,
            isAnnotated: false,
            count: 0,
          })
        }

        allFiles = allFiles.map((item) => {
          const key = path.basename(item.file, path.extname(item.file))
          if (xmlAnnotate.hasOwnProperty([key])) {
            return { ...item, isAnnotated: true, count: xmlAnnotate[key] }
          } else {
            return item
          }
        })
      })
      res.json({
        fullPath: nodeDir,
        projectDir: req.body.path,
        path: testFolder,
        folder: imageDir,
        files: allFiles,
      })
    })
  } else {
    var imclassPath = path.join(nodeDir, clientPublicDir, req.params.proj, 'imclass.json')
    console.log("imclassPath:" + imclassPath);
    fs.readFile(imclassPath, 'utf-8', function (err, data) {
      if (err){
        return res.end()
      }
      var arrayOfObjects = JSON.parse(data)

      var impath = path.join(nodeDir, clientPublicDir, req.params.proj, 'images')
      fs.readdir(impath, (err, files) => {
        files.forEach((file, i) => {
          var index = arrayOfObjects.annotations.findIndex((x) => x.file === file)
          var isAnotated = 0
          var classes = 'none'
          if (index === -1) {
            isAnotated = 0
          } else {
            isAnotated = 1
            classes = arrayOfObjects.annotations[index].class
          }

          const ext = path.extname(file)
          if (ext !== '.xml') {
            allFiles.push({
              file: file,
              id: i,
              isAnnotated: isAnotated,
              class: classes,
            })
          }
        })

        res.json({
          fullPath: nodeDir,
          projectDir: req.body.path,
          path: testFolder,
          folder: imageDir,
          files: allFiles,
        })

      })
    })
  }
})

app.post('/img/:proj/model/download', function (req, res, next) {
  var options = {
    'method': 'POST',
    'url': ' http://localhost:8000/download_model',
    'headers': {
      'Content-Type': 'multipart/form-data'
    },
    formData: {
      'model_filename': req.body.filename,
      'save_path': path.join(nodeDir, clientPublicDir, req.params.proj, req.body.filename),
      'save_label_path': path.join(nodeDir, clientPublicDir, req.params.proj, 'label_map.pkl'),
    }
  };

  request(options, function (error, response) {
    if (error) res.json({ status: 'error', message: 'Something went wrong' })
    res.json({ status: 'success', message: "Successfully downloaded" })
  });
})

app.get('/img/:proj/class', (req, res) => {
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.proj,
    'label.json',
  )

  fs.readFile(classPath, 'utf-8', function (err, data) {
    if (err) console.log(err)
    var json = JSON.parse(data)
    res.json(json.class)
  })
})

app.put('/img/:proj/class', (req, res) => {
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.proj,
    'label.json',
  )

  fs.readFile(classPath, 'utf-8', function (err, data) {
    if (err) throw err
    var json = JSON.parse(data)
    json.class.push({ label: req.body.label })
    fs.writeFile(classPath, JSON.stringify(json), function (err) {
      if (err) {
        return res.end(
          JSON.stringify({
            status: 'failed',
          }),
        )
      } else {
        return res.json(json.class)
      }
    })
  })
})

app.post('/img/:project/label', (req, res) => {
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'imclass.json',
  )

  fs.readFile(classPath, 'utf-8', function (err, data) {
    if (err) throw err
    var json = JSON.parse(data)
    var files = req.body.file
    files.forEach((cur) => {
      var dataWithClass = { file: cur, class: req.body.label }
      var index = json.annotations.findIndex((item) => item.file === cur)
      if (index !== -1) json.annotations[index] = dataWithClass
      else json.annotations.push(dataWithClass)
    })

    fs.writeFile(classPath, JSON.stringify(json), function (err) {
      if (err) {
        return res.end(
          JSON.stringify({
            status: 'failed',
          }),
        )
      } else {
        return res.end(
          JSON.stringify({
            status: 'success',
          }),
        )
      }
    })
  })
})

app.delete('/img/:project/label/:file', async function (req, res, next) {
  var annotatePath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'imclass.json',
  )

  fs.readFile(annotatePath, 'utf-8', function (err, data) {
    if (err) throw err
    var json = JSON.parse(data)
    var filtered = json.annotations.filter(item => item.file !== req.params.file)
    json.annotations = filtered
    fs.writeFile(annotatePath, JSON.stringify(json), function (err) {
      if (err) {
        return res.json({
          status: 'failed',
        })
      } else {
        return res.json({
          status: 'success',
        })
      }
    })
  })
})

app.post('/archiveFile', function (req, res, next) {
  const path = `${nodeDir}${clientPublicDir}/${req.body.path}/images`
  let output = new streamBuffers.WritableStreamBuffer({
    initialSize: 1000 * 1024,
    incrementAmount: 1000 * 1024,
  })
  var archive = archiver('zip', {
    zlib: {
      level: 9,
    },
  })

  output.on('close', function () {
    console.log(archive.pointer() + ' total bytes')
  })

  output.on('finish', function () {
    res.write(output.getContents(), 'binary')
    res.end()
  })

  archive.on('error', function (err) {
    throw err
  })

  archive.pipe(output)
  archive.directory(path, false)
  archive.finalize()
})

app.post('/extractFile', upload.any(), function (req, res) {
  const path = nodeDir + `${clientPublicDir}/` + req.body.path
  var readStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 10,
    chunkSize: 2048,
  })

  readStream.put(req.files[0].buffer)
  readStream
    .pipe(zlib.Unzip())
    .pipe(new tar.Parse())
    .on('entry', function (entry) {
      var fullpath = `${path}/${entry.path}`
      entry.pipe(fs.createWriteStream(fullpath))
    })
  readStream.stop()
  res.send('Successfully extract file.')
})

app.delete('/project/:name', function (req, res, next) {
  const projectPath = path.join(nodeDir, clientPublicDir, req.params.name)
  rimraf(projectPath, function () {
    res.end(
      JSON.stringify({
        status: 'OK',
      }),
    )
  })
})

app.get('/getProjects/:type', function (req, res, next) {
  const pathPublic = path.join(nodeDir, clientPublicDir)
  console.log('req.params.type ', req.params.type)
  var dds = getDirectories(pathPublic, req.params.type).map(getDirectoryName)

  res.end(
    JSON.stringify({
      projects: dds,
      status: 'OK',
    }),
  )
})

app.get('/getIP', function (req, res, next) {
  console.log(ip.address())

  res.json({
    IP: ip.address(),
  })
})

app.get('/getDrive', function (req, res, next) {
  const drives = drivelist.list()
  drives.then((result) => {
    result.forEach((value) => {
      console.log(value.device)

      if (value.device === '/dev/sda') {
        mountPoint = value.mountpoints[0].path
        console.log(mountPoint)
        res.json({
          drives: 'OK',
          mountPoints: mountPoint,
        })
      } else {
        res.json({
          drives: 'NO_DRIVE',
        })
      }
    })
  })
})

app.post('/checkXmlFile', function (req, res, next) {
  const fs = require('fs')

  const path = nodeDir + `${clientPublicDir}` + req.body.filename
  console.error(path)
  res.setHeader('Content-Type', 'application/json')
  try {
    if (fs.existsSync(path)) {
      fs.readFile(
        path,
        {
          encoding: 'utf-8',
        },
        function (err, data) {
          if (!err) {
            var rjson = convert.xml2json(data, options)
            res.end(
              JSON.stringify({
                status: 'OK',
                data: rjson,
              }),
            )
          } else {
            res.end(
              JSON.stringify({
                status: 'FAIL',
              }),
            )
          }
        },
      )
    } else {
      res.end(
        JSON.stringify({
          status: 'FAIL',
        }),
      )
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/writeXml', function (req, res) {
  var filename = nodeDir + clientPublicDir + req.body.filename
  var data = req.body.data
  var fs = require('fs')

  fs.unlink(filename, (err) => {
    if (err) {
      if (err.errno == -2) {
        fs.writeFile(filename, data, (err) => {
          if (err) {
            res.end(
              JSON.stringify({
                status: 'FAIL',
              }),
            )
            return console.log(err)
          } else {
            console.log('The file was saved!')
            res.end(
              JSON.stringify({
                status: 'OK',
              }),
            )
            return
          }
        })
        res.end(
          JSON.stringify({
            status: 'OK',
          }),
        )
      } else {
        console.error(err)
        res.end(
          JSON.stringify({
            status: 'FAIL',
          }),
        )
        return
      }
    } else {
      console.log('file is deleted')
      fs.writeFile(filename, data, (err) => {
        if (err) {
          res.end(
            JSON.stringify({
              status: 'FAIL',
            }),
          )
          return console.log(err)
        } else {
          console.log('The file was saved!')
          res.end(
            JSON.stringify({
              status: 'OK',
            }),
          )
          return
        }
      })
      res.end(
        JSON.stringify({
          status: 'OK',
        }),
      )
      return
    }

    //file removed
  })

  console.log(filename + ' ' + data)
  res.end(
    JSON.stringify({
      status: 'OK',
    }),
  )
  return
})

app.post('/runPython3', function (req, res) {
  var filename = nodeDir + `${clientPublicDir}/` + req.body.filename
  var data = req.body.data
  var fs = require('fs')
  fs.writeFile(filename, data, function (err) {
    if (err) {
      return console.log(err)
    } else {
      console.log('The file was saved!')
    }
  })
  console.log(filename + ' ' + data)
  res.end(
    JSON.stringify({
      status: 'OK',
    }),
  )
  return
})

app.post('/createProject', function (req, res) {
  var projectDir = path.join(nodeDir, clientPublicDir, req.body.name)

  mkDirByPathSync(projectDir)

  if (req.body.type === 'Sound') {
    mkDirByPathSync(projectDir + '/audios')
    mkDirByPathSync(projectDir + '/audios/client')
    mkDirByPathSync(projectDir + '/audios/wav')
    mkDirByPathSync(projectDir + '/audios/mfcc')
    mkDirByPathSync(projectDir + '/audios/mfcc/text')
    mkDirByPathSync(projectDir + '/audios/mfcc/image')

    var classPath = path.join(projectDir, '/audios/class.json')
    var annotaion = {
      annotations: [],
    }
    fs.writeFileSync(classPath, JSON.stringify(annotaion))

    var labelPath = path.join(projectDir, '/audios/label.json')
    var label = {
      class: []
    }
    fs.writeFileSync(labelPath, JSON.stringify(label))

    var orderPath = path.join(projectDir, '/audios/order.json')
    var order = {
      order: []
    }
    fs.writeFileSync(orderPath, JSON.stringify(order))

  } else {
    mkDirByPathSync(projectDir + '/images')

    var imclassPath = path.join(projectDir, 'imclass.json')
    var imclassAnotaion = {
      annotations: [],
    }
    fs.writeFileSync(imclassPath, JSON.stringify(imclassAnotaion))

    var labelPath = path.join(projectDir, 'label.json')
    var label = {
      class: []
    }
    fs.writeFileSync(labelPath, JSON.stringify(label))
  }

  // write xml file for checking
  var now = new Date()
  var json = {
    Project: {
      Name: req.body.name,
      CreatedOn: now.toString(),
      Type: req.body.type,
      Duration: req.body.duration,
      Delay: req.body.delay
    },
  }
  var stringified = JSON.stringify(json)
  var xml = parser.toXml(stringified)
  var xmlPath = path.join(projectDir, 'project.xml')

  fs.writeFileSync(xmlPath, xml)

  return res.json({
    status: 'OK'
  }
  )

})

app.get('/getPython', function (req, res) {
  console.log(req.query.file)
  var projectDir =
    nodeDir + '/nectec-client/src/components/scripts/' + req.query.file //req.body.projectDir "start_object_detector.py"
  var fs = require('fs')
  try {
    var data_t = fs.readFileSync(projectDir, 'utf8')
    console.log(data_t.toString())
    res.end(
      JSON.stringify({
        data: data_t,
        status: 'OK',
      }),
    )
  } catch (e) {
    console.log('Error:', e.stack)
    res.end(
      JSON.stringify({
        status: 'not OK',
      }),
    )
  }

  return
})

app.post('/upload/image', function (req, res, next) {
  try {
    // to declare some path to store your converted image
    //var projectDir = nodeDir + "/client/public/" + req.body.projectDir
    const toPath =
      nodeDir +
      `${clientPublicDir}/` +
      req.body.path +
      '/images/' +
      Date.now() +
      '.png'

    //console.log(req.body.base64image)

    const imgdata = String(req.body.base64image)

    // to convert base64 format into random filename
    const base64Data = imgdata.replace(/^data:([A-Za-z-+/]+);base64,/, '')

    fs.mkdir(path.dirname(toPath), { recursive: true }, (err) => {
      if (err) throw err
      fs.writeFileSync(toPath, base64Data, {
        encoding: 'base64',
      })
    })

    res.end(
      JSON.stringify({
        status: 'OK',
      }),
    )

    return
  } catch (e) {
    next(e)
  }
})

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'tmp')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  },
})

var importFile = multer({
  storage,
})

app.post(
  '/import/images/:project',
  importFile.single('image'),
  (req, res, next) => {
    const file = req.file
    if (!file) {
      const error = new Error('Please upload a file')
      error.httpStatusCode = 400
      return next(error)
    }
    const filename = file.filename

    const fromPath = path.join(nodeDir, 'server/tmp', filename)

    const toPath = path.join(
      nodeDir,
      clientPublicDir,
      req.params.project,
      'images',
      `${Date.now()}.${path.extname(filename)}`,
    )
    fs.rename(fromPath, toPath, function (err) {
      if (err) {
        return console.error(err)
      }
      res.send(file)
    })
  },
)

const FRAME_PER_SEC = 4

app.post('/robot/record', function (req, res, next) {
  try {

    const destination = path.join(
      nodeDir,
      clientPublicDir,
      req.body.project,
      'audios',
    )
    const num_frame = parseInt(req.body.duration) * FRAME_PER_SEC

    const d = new Date()
    var name = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2)
      + "_" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + ("0" + d.getSeconds()).slice(-2);

    var options = {
      'method': 'POST',
      'url': ' http://localhost:8000/record',
      'headers': {
        'Content-Type': 'multipart/form-data'
      },
      formData: {
        'wav_filepath': path.join(destination, 'wav', `${name}.wav`),
        'num_frame': num_frame,
        'mfcc_text_file': path.join(destination, 'mfcc/text', `${name}.csv`),
        'mfcc_image_file': path.join(destination, 'mfcc/image', `${name}.jpg`)
      }
    };

    request(options, function (error, response) {
      if (error) throw new Error(error);
      console.log(response.body);
      res.end(
        JSON.stringify({
          status: 'OK',
        }),
      )
    });

  } catch (e) {
    next(e)
  }
})

app.get('/wav/:project', function (req, res, next) {
  var allFiles = []

  var projDescriptionPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'project.xml',
  )

  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/class.json',
  )

  var orderPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/order.json',
  )

  setTimeout(() => {
    try{
      const data = fs.readFileSync(projDescriptionPath, { encoding: 'utf-8' })
      var jsonString = convert.xml2json(data, optionsProj)
      const json = JSON.parse(jsonString)
      const projDescription = json.Project._attributes
  
      fs.readFile(classPath, 'utf-8', function (err, data) {
        var json = JSON.parse(data)
  
        var wavDir = path.join(
          nodeDir,
          clientPublicDir,
          req.params.project,
          'audios/wav',
        )
  
        var csvDir = path.join(
          nodeDir,
          clientPublicDir,
          req.params.project,
          'audios/mfcc/text',
        )
  
        fs.readFile(orderPath, (err, dataOrder) => {
          var jsonOrder = JSON.parse(dataOrder)
          var jsonClone = jsonOrder.order
          jsonOrder.order.forEach((file, i) => {
            var index = json.annotations.findIndex((x) => x.file === file)
            var isAnnotated = true
            var classes = 'none'
            if (index === -1) {
              isAnnotated = false
            } else {
              classes = json.annotations[index].class
            }
            if (fs.existsSync(path.join(csvDir, path.basename(file, '.wav') + '.csv'))) {
              allFiles.push({
                file: file,
                id: i,
                isAnnotated,
                class: classes,
              })
            } else {
              try {
                if (jsonClone)
                  jsonClone = jsonClone.filter((item) => item !== file)
                fs.unlinkSync(path.join(wavDir, file))
              } catch (err) {
                if (err.code == 'ENOENT') {
                  // if (jsonClone)
                  //   jsonClone = jsonClone.filter((item) => item !== file)
                }
                console.log(err)
              }
            }
          })
  
          try {
            fs.writeFileSync(orderPath, JSON.stringify({ order: jsonClone }))
          } catch (err) {
            console.log(err)
          }
  
  
          res.json({
            projectDir: req.params.project,
            folder: audioDir,
            files: allFiles,
            projDescription,
            projDescriptionPath,
            classPath,
            orderPath
          })
        })
      })
    }catch(err){
      if (err.code === 'ENOENT') {
        console.log('File not found!');
      } else {
        throw err;
      }
    }
  }, 2000)
  
})

app.put('/wav/:project/order', function (req, res, next) {
  var orderPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/order.json',
  )
  var newOrder = { order: req.body.order }
  fs.writeFile(orderPath, JSON.stringify(newOrder), (err) => {
    if (err) {
      return res.json({
        status: 'failed',
      })
    } else {
      return res.json({
        status: 'success',
      })
    }
  })
})

app.post('/wav/:project/client/upload', function (req, res, next) {
  try {
    const now = new Date()
    const pathToSave = path.join(nodeDir, clientPublicDir, req.params.project, 'audios/client', now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '_' + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0') + '.wav')
    const audiodata = String(req.body.base64)

    const base64Data = audiodata.replace(/^data:([A-Za-z-+/]+);base64,/, '')

    fs.writeFileSync(pathToSave, base64Data, {
      encoding: 'base64',
    })

    res.end(
      JSON.stringify({
        status: 'OK',
      }),
    )

    return
  } catch (e) {
    next(e)
  }
})

app.post('/wav/:project/order/add', function (req, res, next) {
  var orderPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/order.json',
  )

  var wavDir = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/wav',
  )

  fs.readFile(orderPath, (err, data) => {
    var json = JSON.parse(data)

    fs.readdir(wavDir, (err, files) => {
      files.forEach((cur) => {
        var found = json.order.find((x) => x === cur)
        if (!found) {
          json.order.unshift(cur)
        }
      })
      fs.writeFile(orderPath, JSON.stringify(json), (err) => {
        if (err) {
          return res.json({
            status: 'failed',
          })
        } else {
          return res.json({
            status: 'success',
          })
        }
      })
    })
  })

})

app.post('/wav/:project/model/download', function (req, res, next) {
  var options = {
    'method': 'POST',
    'url': ' http://localhost:8000/download_model',
    'headers': {
      'Content-Type': 'multipart/form-data'
    },
    formData: {
      'model_filename': req.body.filename,
      'save_path': path.join(nodeDir, clientPublicDir, req.params.project, 'audios', req.body.filename),
      'save_label_path': path.join(nodeDir, clientPublicDir, req.params.project, 'audios/label_map.pkl'),
    }
  };

  request(options, function (error, response) {
    if (error) res.json({ status: 'error', message: 'Something went wrong' })
    res.json({ status: 'success', message: "Successfully downloaded" })
  });
})

app.delete('/wav/:project/:file', function (req, res, next) {
  var annotatePath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/class.json',
  )

  var orderPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/order.json',
  )


  var wavePath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/wav',
    req.params.file
  )

  var imMFCCPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/mfcc/image',
    path.basename(req.params.file, '.wav') + '.jpg',
  )

  var csvMFCCPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/mfcc/text',
    path.basename(req.params.file, '.wav') + '.csv',
  )

  fs.readFile(annotatePath, 'utf-8', function (err, data) {
    if (err) console.log(err)
    var json = JSON.parse(data)
    var filtered = json.annotations.filter(item => item.file !== req.params.file)
    json.annotations = filtered
    fs.writeFile(annotatePath, JSON.stringify(json), function (err) {
      if (err) {
        console.log('error 1', err)
        return res.json({
          status: 'failed',
        })
      } else {
        try {
          var order = fs.readFileSync(orderPath)
          var json = JSON.parse(order)
          json.order = json.order.filter(item => item !== req.params.file)
          fs.writeFileSync(orderPath, JSON.stringify(json))
          fs.unlinkSync(wavePath)
          fs.unlinkSync(imMFCCPath)
          fs.unlinkSync(csvMFCCPath)
          return res.json({
            status: 'success',
          })
        }
        catch(err) {
          console.log('error 2', err)
          return res.json({
            status: 'failed',
          })
        }
      }
    })
  })
})

app.get('/wav/:project/class', (req, res) => {
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/label.json',
  )
  setTimeout(() => {
    fs.readFile(classPath, 'utf-8', function (err, data) {
      if(err){
        console.log('Something went wrong')
      }else{
        var json = JSON.parse(data)
        console.log(json)
        res.json(json.class)
      }
    })
  }, 2000)
})

app.put('/wav/:project/class', (req, res) => {
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/label.json',
  )

  fs.readFile(classPath, 'utf-8', function (err, data) {
    if (err) throw err
    var json = JSON.parse(data)
    json.class.push({ label: req.body.label })
    fs.writeFile(classPath, JSON.stringify(json), function (err) {
      if (err) {
        return res.end(
          JSON.stringify({
            status: 'failed',
          }),
        )
      } else {
        return res.json(json.class)
      }
    })
  })
})

app.post('/wav/:project/label', (req, res) => {
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/class.json',
  )

  fs.readFile(classPath, 'utf-8', function (err, data) {
    if (err) throw err
    var json = JSON.parse(data)
    var files = req.body.file
    files.forEach((cur) => {
      var dataWithClass = { file: cur, class: req.body.label }
      var index = json.annotations.findIndex((item) => item.file === cur)
      if (index !== -1) json.annotations[index] = dataWithClass
      else json.annotations.push(dataWithClass)
    })

    fs.writeFile(classPath, JSON.stringify(json), function (err) {
      if (err) {
        return res.end(
          JSON.stringify({
            status: 'failed',
          }),
        )
      } else {
        return res.end(
          JSON.stringify({
            status: 'success',
          }),
        )
      }
    })
  })
})

app.delete('/wav/:project/label/:file', async function (req, res, next) {
  var annotatePath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/class.json',
  )

  fs.readFile(annotatePath, 'utf-8', function (err, data) {
    if (err) throw err
    var json = JSON.parse(data)
    var filtered = json.annotations.filter(item => item.file !== req.params.file)
    json.annotations = filtered
    fs.writeFile(annotatePath, JSON.stringify(json), function (err) {
      if (err) {
        return res.json({
          status: 'failed',
        })
      } else {
        return res.json({
          status: 'success',
        })
      }
    })
  })
})

app.delete('/wav/:project/class/:className', async function (req, res, next) {
  var selectedClassName = req.params.className;
  var classPath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/label.json',
  )
  var annotatePath = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/class.json',
  )
  fs.readFile(annotatePath, 'utf-8', function (err, annotateData) {
    if (err) throw err
    var annotateClass = JSON.parse(annotateData)
    let checkAnnotate = annotateClass.annotations.findIndex((item) => item.class === selectedClassName);
    if (checkAnnotate !== -1) {
      return res.json({
        status: 'busy',
      })
    } else {
      try {
        var classData = fs.readFileSync(classPath)
        var classJson = JSON.parse(classData)
        let filteredClass = classJson.class.filter((item) => item.label !== selectedClassName);
        classJson.class = filteredClass;
        fs.writeFile(classPath, JSON.stringify(classJson), function (err) {
          if (err) {
            return res.json({
              status: 'failed',
            })
          } else {
            return res.json({
              status: 'success',
            })
          }
        })
      }catch(err){
        console.log('classPath Err :', err)
        return res.json({
          status: 'fail',
        })
      }
    }
  })
})

app.post('/wav/:project/archive', async function (req, res, next) {
  var zip = new require('node-zip')()
  const pathAnnotated = path.join(
    nodeDir,
    clientPublicDir,
    req.params.project,
    'audios/class.json',
  )
  fs.readFile(pathAnnotated, async (err, data) => {
    if (err) return res.status(404).send()
    if (!data) return res.status(404).send()
    else {
      try {
        let annotated = JSON.parse(data)
        const pathWav = path.join(
          nodeDir,
          clientPublicDir,
          req.params.project,
          'audios/mfcc/text',
        )
        for (const item of annotated.annotations) {
          await zip.file(
            `audios/${item.class}/${item.file}`,
            fs.readFileSync(path.join(pathWav, `${path.parse(item.file).name}.csv`)),
          )
        }
        const trainingSet = await zip.generate({
          base64: false,
          compression: 'DEFLATE',
        })
        const pathZip = path.join(
          nodeDir,
          clientPublicDir,
          req.params.project,
          'audios/audios.zip')
        fs.writeFileSync(pathZip, trainingSet, 'binary')
        res.json({ status: 'Zipped successfully.', path: pathZip })
      }
      catch (err) {
        console.log(err)
      }
    }
  })
})

app.get('/getBlocksDefinition.js', function (req, res, next) {
  const base_blocks = `Blockly.Blocks['sumorobot_opponent'] = {
            init: function () {
                this.setColour("#0099E6");
                this.appendDummyInput().appendField('opponent');
                this.setOutput(true, 'Boolean');
            }
        };
        Blockly.Blocks['start_object_detector'] = {
            init: function () {
                this.appendDummyInput()
                    .appendField("Start object detector");
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(230);
                this.setTooltip("");
                this.setHelpUrl("");
            }
        };`

  res.setHeader('content-type', 'text/javascript')
  res.end(base_blocks)
})

app.post('/run', (req, res) => {
  var filename = nodeDir + `${clientPublicDir}/` + req.body.filename
  var data = req.body.data
  var fs = require('fs')
  fs.writeFile(filename, data, function (err) {
    if (err) {
      return console.log(err)
    } else {
      console.log('The file was saved!')
      console.log(filename)
      app.locals.child = spawn('python3', ['-u', filename], {
        detached: true,
      })
      app.locals.child.stdout.on('data', function (data) {
        console.log('Pipe data from python script ...')
        console.log(Buffer.from(data, 'utf-8').toString())
        dataToSend = data.toString()

        // Construct the message
        std_out_msg.data = dataToSend
        // Publish over ROS
        std_out_python_pub.publish(std_out_msg)
      })

      app.locals.child.on('close', (code) => {
        console.log(`child process close all stdio with code ${code}`)
        // send data to browser

        // Construct the message
        if (code == 1) {
          std_out_msg.data = 'DONE'
          // Publish over ROS
          std_out_python_pub.publish(std_out_msg)
        }

        if (code == 0) {
          std_out_msg.data = 'DONE'
          // Publish over ROS
          std_out_python_pub.publish(std_out_msg)
        }
      })
    }
  })
  console.log(filename + ' ' + data)
  res.end(
    JSON.stringify({
      status: 'OK',
    }),
  )
})

app.post('/stop', (req, res) => {
  console.log('signal term')
  //console.log(app.locals.child)
  //app.locals.child.kill('SIGTERM');
  if (app.locals.child.pid === null || app.locals.child.pid === undefined) {
    console.log('The process has gone')
    res.status(201).json(req.body)
  } else {
    console.log('The process is still running')
    process.kill(-app.locals.child.pid)
    res.status(201).json(req.body)
  }
})

app.post('/retrainImg', (req, response) => {
  var dataToSend
  var projPath = nodeDir + `${clientPublicDir}/` + req.body.projectpath
  var imgData = projPath + `/imgclass`
  console.log(projPath)
  var python = spawn('python3', [
    '-u',
    'python/backprop_last_layer.py',
    '--data_dir',
    imgData,
    '--embedding_extractor_path',
    'python/mobilenet_v1_1.0_224_quant_embedding_extractor_edgetpu.tflite',
    '--output_dir',
    projPath,
  ])
  python.stdout.on('data', function (data) {
    console.log('Pipe data from python script ...')
    console.log(Buffer.from(data, 'utf-8').toString())
    dataToSend = data.toString()

    // Construct the message
    std_out_msg.data = dataToSend
    // Publish over ROS
    std_out_pub.publish(std_out_msg)
  })

  python.on('close', (code) => {
    console.log(`child process close all stdio with code ${code}`)
    // send data to browser
    response.send(dataToSend)
    // Construct the message
    if (code == 0) {
      std_out_msg.data = 'DONE'
      // Publish over ROS
      std_out_pub.publish(std_out_msg)
    }
  })
})

app.post('/imclassAnotaion', (req, res) => {
  var dir = path.join(nodeDir, clientPublicDir, req.body.projectpath, `/imgclass/`, req.body.dirname)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    res.end(
      JSON.stringify({
        status: 'OK',
      }),
    )
  } else {
    res.end(
      JSON.stringify({
        status: 'FAIL',
      }),
    )
  }
})

app.post('/removeImclassAnotaion', (req, res) => {
  var dir = path.join(nodeDir, clientPublicDir, req.body.projectpath, `/imgclass/`, req.body.dirname)

  if (!fs.existsSync(dir)) {
    res.end(
      JSON.stringify({
        status: 'FAIL',
      }),
    )
  } else {
    rimraf(dir, function () {
      console.log('done')
      res.end(
        JSON.stringify({
          status: 'OK',
        }),
      )
    })
  }
})

app.post('/getAnotaions', (req, res) => {
  var dir = path.join(nodeDir, clientPublicDir, req.body.projectpath, 'imgclass')

  var dds = getClassDirectories(dir).map(getDirectoryName)

  res.end(
    JSON.stringify({
      classes: dds,
      status: 'OK',
    }),
  )
})

app.post('/deleteImage', (req, res) => {
  console.log('add class')
  console.log(req.body)
  var xmlname = path.parse(req.body.filename).name + '.xml'
  var imclassPathXml = path.join(
    nodeDir + `${clientPublicDir}/` + req.body.projectpath + '/images',
    xmlname,
  )
  try {
    fs.unlinkSync(imclassPathXml)
  } catch (err) { }
  var imclassPath = path.join(
    nodeDir + `${clientPublicDir}/` + req.body.projectpath + '/images',
    req.body.filename,
  )
  console.log(imclassPath)

  try {
    fs.unlinkSync(imclassPath)
    //file removed
    var imclassPath = path.join(
      nodeDir + `${clientPublicDir}/` + req.body.projectpath,
      'imclass.json',
    )
    console.log(imclassPath)

    fs.readFile(imclassPath, 'utf-8', function (err, data) {
      if (err) throw err

      var arrayOfObjects = JSON.parse(data)

      var index = arrayOfObjects.annotations.findIndex(
        (x) => x.file === req.body.filename,
      )

      if (index !== undefined) arrayOfObjects.annotations.splice(index, 1)

      console.log(arrayOfObjects)

      fs.writeFile(
        imclassPath,
        JSON.stringify(arrayOfObjects),
        'utf-8',
        function (err) {
          if (err) throw err
          console.log('Done!')
          res.end(
            JSON.stringify({
              status: 'OK',
            }),
          )
        },
      )
    })
    res.end(
      JSON.stringify({
        status: 'OK',
      }),
    )
  } catch (err) {
    console.error(err)
    res.end(
      JSON.stringify({
        status: 'FAIL',
      }),
    )
  }
})

app.post('/createImclassDataset', (req, res) => {
  var imclassPath = path.join(
    nodeDir + `${clientPublicDir}/` + req.body.path,
    'imgclass',
  )
  var imgsPath = path.join(
    nodeDir + `${clientPublicDir}/` + req.body.path,
    'images',
  )
  var imgsPath = path.join(
    nodeDir + `${clientPublicDir}/` + req.body.path,
    'images',
  )

  console.log('Anotation dir = ' + imclassPath)

  var dds = getClassDirectories(imclassPath).map(getDirectoryName)
  console.log(dds)

  dds.forEach(function (item, index) {
    var dest = imclassPath + '/' + item
    fs.readdir(dest, (err, files) => {
      if (err) throw err

      for (const file of files) {
        fs.unlink(path.join(dest, file), (err) => {
          if (err) throw err
        })
      }
    })
  })

  var classPath = path.join(
    nodeDir + `${clientPublicDir}/` + req.body.path,
    'imclass.json',
  )
  console.log(imclassPath)

  fs.readFile(classPath, 'utf-8', function (err, data) {
    if (err) throw err

    var arrayOfObjects = JSON.parse(data)

    arrayOfObjects.annotations.forEach(function (item, index) {
      console.log(item, index)
      var source = imgsPath + '/' + item.file
      var dest = imclassPath + '/' + item.class + '/' + item.file
      console.log(source)
      console.log(dest)

      fs.symlink(source, dest, function (err) {
        console.log(err || 'Done.')
      })
    })

    res.end(
      JSON.stringify({
        status: 'OK',
      }),
    )
  })
})

app.post('/saveXML', (req, res) => {
  var filename = nodeDir + `${clientPublicDir}/` + req.body.filename
  var data = req.body.data
  var fs = require('fs')
  fs.writeFile(filename, data, function (err) {
    if (err) {
      return console.log(err)
    } else {
      console.log('The file was saved!')
    }
  })
  console.log(filename + ' ' + data)
  res.end(
    JSON.stringify({
      status: 'OK',
    }),
  )
})

app.post('/getXML', (req, response) => {
  var filename = nodeDir + `${clientPublicDir}/` + req.body.filename
  console.log(filename)

  var fs = require('fs'),
    xml2js = require('xml2js')

  var parser = new xml2js.Parser()
  fs.readFile(filename, function (err, data) {
    console.log(data)
    if (!err) {
      console.log('received data: ' + data)
      response.writeHead(200, {
        'Content-Type': 'text/xml',
      })
      response.write(data)
      response.end()
    } else {
      console.log(err)
    }
    /*  parser.parseString(data, {encoding: 'utf-8'},  function (err, result) {
        console.log(result);
        console.log('Done');
  
    
    
      });*/
  })
})

app.post('/listWifi', function (req, res, next) {
  wifi.scan((error, networks) => {
    if (error) {
      console.log(error)
    } else {
      console.log(networks)
      res.end(
        JSON.stringify({
          ap: networks,
          status: 'OK',
        }),
      )
    }
  })
})

app.post('/wifiConnect', function (req, res, next) {
  wifi.connect(
    { ssid: req.body.ssid, password: req.body.password },
    (error) => {
      if (error) {
        console.log(error)
      }
      console.log('Connected')

      res.end(
        JSON.stringify({
          status: 'OK',
        }),
      )
    },
  )
})

app.get('/wifi/current', function (_, res) {
  wifi.getCurrentConnections((error, currentConnections) => {
    if (error) {
      console.log(error);
    } else {
      console.log(currentConnections);
      res.json({
        ap: currentConnections,
        status: 'OK',
      })
    }
  });
})

app.use(express.static('./nectec-client/dist'))

app.listen(3000, function () {
  console.log('CORS-enabled web server listening on port 3000')
})
