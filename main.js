const {app, BrowserWindow} = require('electron')
const path = require('path')
const ipc = require('electron').ipcMain

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 600, height: 500})

  // and load the index.html of the app.
  mainWindow.loadURL(path.join('file://', __dirname, 'index.html'))

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

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

const request = Request.defaults({
  jar: true,
  followAllRedirects: true
})

/* globals----------------------------- */

const moodleURL = 'https://moodle.hochschule-rhein-waal.de/login/index.php'
let credentials
let courses
let newCoursesCount = 0

/* globals----------------------------- */

function mask (string) {
  return string
    .split('')
    .map((c, i, a) => (i > 0 && i < a.length - 1) ? '*' : c)
    .join('')
}

ipc.on('save-credentials', (event, _credentials) => {
  if (_credentials.username === '' || _credentials.password === '') {
    console.warn('CREDENTIALS INVALID:', _credentials)
  } else {
    credentials = _credentials
    console.info('CREDENTIALS SET:', _credentials.username, mask(_credentials.password))
  }
})

ipc.on('update-courses', (event) => {
  // Start time for getting courses
  console.time('update-courses')

  request.post(moodleURL, {form: credentials},
    (err, res, body) => {
      if (err) { throw err }

      console.log('COOKIE', res.headers['set-cookie'])
      // console.log('BODY:', body)

      // Reset existing courses before getting new ones
      courses = []

      const $ = cheerio.load(body)
      $('.type_course a').each(
        (i, a) => {
          const href = $(a).attr('href').replace('/view.php?', '/resources.php?')
          const course = {
            title: $(a).attr('title'),
            url: href,
            id: href.match(/id=([0-9]+)/)[1]
          }

          courses.push(course)
          newCoursesCount++
          ipc.emit('update-course-resources', course)
        }
      )
      // Stop time for getting courses
      console.timeEnd('update-courses')

      /*
       // Send courses back to renderer
       event.sender.send('courses-updated', courses)
       */
    }
  )
})

ipc.on('update-course-resources', (course) => {
  // Start time for getting courseResources
  console.time('update-course-resources')

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

      // Add course to global courses
      // courses.push(course)
      console.log(courses)
    })
})
