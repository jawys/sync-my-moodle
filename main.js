const {app, BrowserWindow, dialog} = require('electron')
const path = require('path')
const ipc = require('electron').ipcMain
const fs = require('fs')

// Check if running in development
const isDev = require('electron-is-dev')

if (isDev) {
  console.log('Running in development')
  app.setName(require('./package').productName)
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 600, height: 500})

  // and load the index.html of the app.
  mainWindow.loadURL(path.join('file://', __dirname, 'index.html'))

  // Open DevTools during development
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const Request = require('request')
const cheerio = require('cheerio')

const jar = Request.jar()
const request = Request.defaults({
  jar: jar,
  followAllRedirects: true
})

/* globals----------------------------- */

const moodleURL = 'https://moodle.hochschule-rhein-waal.de/login/index.php'
let credentials
let courses
let courseUpdateCount = 0

/* globals----------------------------- */

function mask (str) {
  return str.charAt(0).concat('*'.repeat(str.length - 2), str.slice(-1))
}

ipc.on('save-credentials', (event, _credentials) => {
  if (_credentials.username === '' || _credentials.password === '') {
    console.warn('CREDENTIALS INVALID:', _credentials)
  } else {
    credentials = _credentials
    console.info('CREDENTIALS SET:', _credentials.username, mask(_credentials.password))
  }
})

ipc.on('update-courses', () => {
  // Start time
  console.time('update-courses-list')
  console.time('update-courses')

  request.post(moodleURL, {form: credentials},
    (err, res, body) => {
      if (err) { throw err }

      console.log('COOKIES:', jar.getCookies(moodleURL))
      // console.log('BODY:', body)

      // Reset existing courses before getting new ones
      courses = []

      const $ = cheerio.load(body)
      $('.course_title a').each(
        (i, a) => {
          const href = $(a).attr('href').replace('/view.php?', '/resources.php?')
          const course = {
            title: $(a).attr('title'),
            url: href,
            id: href.match(/id=([0-9]+)/)[1]
          }

          // Push course into global courses and update resources by reference
          courses.push(course)
          ++courseUpdateCount
          ipc.emit('update-course-resources', course)
        }
      )
      // Stop time
      console.timeEnd('update-courses-list')

      // Send initial state to get rendered courses list
      mainWindow.send('courses-updated', courses)
    }
  )
})

ipc.on('update-course-resources', (course) => {
  // Start time
  console.time(course.title)

  request.get(course.url,
    (err, res, body) => {
      if (err) { throw err }

      // Init courseResources
      const courseResources = []

      const $ = cheerio.load(body)
      $('.generaltable tr[class] .c1 a').each(
        (i, a) => {
          const resourceType = $(a).children('img').attr('alt')
          const isFile = ['File', 'Datei'].indexOf(resourceType) !== -1

          if (isFile) {
            const title = $(a).text().trim()
            const href = $(a).attr('href')
            const id = href.match(/id=([0-9]+)/)[1]

            courseResources.push({
              title: title,
              url: href,
              id: id
            })
          }
        }
      )
      // Add found resources to course
      course.resources = courseResources

      // Stop time
      console.timeEnd(course.title)

      // Update of course finished, so decrement courseUpdateCount
      --courseUpdateCount

      // Send courses to renderer if all courses had been updated
      if (courseUpdateCount === 0) {
        mainWindow.send('courses-updated', courses)

        // Stop time
        console.timeEnd('update-courses')
      }
    })
})

let downloadPath

// Open SaveDialog with defaultPath
ipc.on('open-save-dialog', (event) => {
  // Set default path to productName without spaces
  const defaultPath = path.join(
    app.getPath('home'),
    app.getName().replace(/\s/g, '')
  )
  // Set options for SaveDialog
  const options = {
    title: 'Speicherverzeichnis wählen',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath
  }
  dialog.showOpenDialog(mainWindow, options, (filePaths) => {
    if (filePaths) {
      console.log(filePaths)
      const folderPath = filePaths[0]
      event.sender.send('selected-directory', folderPath)
      downloadPath = folderPath
    }
  })
})

function getCourseById (courseId) {
  for (let course of courses) {
    if (course.id === courseId) {
      return course
    }
  }
}

function getResourceFromCourseById (course, resourceId) {
  for (let resource of course.resources) {
    if (resource.id === resourceId) {
      return resource
    }
  }
}

// Handle downloading of resources
ipc.on('download-resource', (event, data) => {
  let course = getCourseById(data.courseId)
  let resource = getResourceFromCourseById(course, data.resourceId)
  let dlPath = path.join(downloadPath, course.title)

  fs.mkdir(dlPath, (err) => {
    if (err) {
      if (err.code === 'EEXIST') {
        console.info('Folder already exists:', dlPath)
      } else {
        throw err
      }
    }

    request(resource.url)
      .on('response', (res) => {
        // TODO: Handle existing file regarding 'last-modified' date
        const filename = res.headers['content-disposition'].match(/filename="(.+)"/)[1]
        dlPath = path.join(dlPath, filename)
        console.log('filename:', filename, '\ndlpath:', dlPath)
        res.pipe(fs.createWriteStream(dlPath))
      })
  })
})
