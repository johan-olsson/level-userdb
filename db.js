var bcrypt = require('bcrypt')
var byteup = require('byteup')
var levelup = require('levelup')

var PREFIX = "user:"

// Turn an email into a key
function k(email) {
  return [PREFIX, email]
}

// Turn a key into an email
function dk(k) {
  return k[1]
}

function genTimestamp(dt) {
  var d = dt || new Date()

  return {unixtime: d.getTime(), hrtime: process.hrtime()}

}

function encryptPassword(password, cb) {
  bcrypt.hash(password, 10, cb)
}

function buildUser(password, data, cb) {
  if (typeof data === 'function') {
    cb = data
    data = {}
  }
  encryptPassword(password, function(err, pass) {
    var d = new Date()
    var userObj = {
      password: pass,
      createdTimestamp: genTimestamp(),
      modifiedTimestamp: genTimestamp(),
      data:data
    }
    cb(null, userObj)
  })
}

module.exports = function(filename) {
  var name = filename || "./level-userdb.db"
  // Install the bytewise leveldb plugin
  byteup()
  var db = levelup(name, {
    keyEncoding: 'bytewise',
    valueEncoding: 'json'
  })


  // Attach methods to LevelUp object

  db.findUser = (function (email, cb) {
    this.get(k(email), function(err, user) {
      if (err) return cb(err)
      user.modifiedDate = new Date(user.modifiedTimestamp.unixtime)
      user.createdDate = new Date(user.createdTimestamp.unixtime)
      user.email = email

      return cb(null, user)
    })
  }).bind(db)

  db.addUser = (function(email, password, data, cb) {
    var self = this
    if (typeof data === 'function') {
      cb = data
      data = {}
    }
    encryptPassword(password, function(err, pass) {
      var d = new Date()
      var userObj = {
        password: pass,
        createdTimestamp: genTimestamp(d),
        modifiedTimestamp: genTimestamp(d),
        data:data
      }
      self.put(k(email), userObj, cb)
    })
  }).bind(db)

  db.checkPassword = (function(email, password, cb) {
    this.findUser(email, function(err, user) {
      if (err || !user) return cb("could not find user", false)
        bcrypt.compare(password.toString(), user.password.toString(), function(err, res) {
          if (err || !res) return cb("password mismatch", false)
          cb(null, user)
        })
    })
  }).bind(db)

  db.changeEmail = (function(email, newEmail, cb) {
    var self = this
    this.findUser(email, function(err, user) {
      if (err) return cb(err)
      user.modifiedTimestamp = genTimestamp()
      self.batch()
        .del(k(email))
        .put(k(newEmail), user)
        .write(cb)
    })
  }).bind(db)

  db.changePassword = (function(email, newPassword, cb) {
    var self = this
    buildUser(newPassword, function(err, userObj) {
      if (err) return cb(err)
      self.findUser(email, function(err, user) {
        if (err) return cb(err)
        userObj.modifiedTimestamp = genTimestamp()
        userObj.data = user.data
        self.put(k(email), userObj, cb)
      })
    })
  }).bind(db)

  db.deleteUser = (function(email, cb) {
    this.del(k(email), cb)
  }).bind(db)

  db.modifyUser = (function(email, data, cb) {
    var self = this
    this.findUser(email, function(err, user) {
      if (err) return cb(err)
      user.data = data
      user.modifiedTimestamp = genTimestamp()
      self.put(k(email), user, cb)
    })
  }).bind(db)

  db.printAllUsers = (function() {
    console.log("==========================================================================================")
    console.log("Email \t\t\t Created At \t\t\t Modified At")
    console.log("==========================================================================================")
    this.createReadStream()
      .on('data', function(data) {
        process.stdout.write(dk(data.key) + "\t\t")
        process.stdout.write(new Date(data.value.createdTimestamp.unixtime) + "\t")
        process.stdout.write(new Date(data.value.modifiedTimestamp.unixtime) + "\n")
      })
      .on('error', function(err) {
        console.log("error: %s", err)

      })
  }).bind(db)


  return db
}