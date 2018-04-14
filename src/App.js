import React, { Component } from 'react'
import './App.css'
import * as moment from 'moment'
import * as pkg from '../package.json'

/**************************************************************
 * Setup
 **************************************************************/

const firebaseConfig = {
  apiKey: "AIzaSyA58BMqwEAw12sgI4guZbsDdVZ7yoXwDqI",
  authDomain: "zonesofprep.firebaseapp.com",
  databaseURL: "https://zonesofprep.firebaseio.com",
  projectId: "zonesofprep",
  storageBucket: "zonesofprep.appspot.com",
  messagingSenderId: "918887966885"
}

const [/*STATE_RED*/, /*STATE_YELLOW*/, /*STATE_GREEN*/, STATE_NULL] = [-1,0,1,2]

// raineorshine@gmail.com test data: https://console.firebase.google.com/u/0/project/zonesofprep/database/zonesofprep/data/users/T9FGz1flWIf1sQU5B5Qf3q6d6Oy1
const defaultZones = JSON.stringify([{
  checkins: [STATE_NULL],
  label: '💤'
}, {
  checkins: [STATE_NULL],
  label: '🥗'
}, {
  checkins: [STATE_NULL],
  label: '👟'
}])

// firebase init
const firebase = window.firebase
firebase.initializeApp(firebaseConfig)
window.__DEBUG = {}
window.__DEBUG.signout = firebase.auth().signOut.bind(firebase.auth())

// init localStorage
if (!localStorage.zones) {
  localStorage.zones = defaultZones
}

if (!localStorage.showFadedToday) {
  localStorage.showFadedToday = 'true'
}

// manually add/remove class to body since it's outside the target element of render
document.body.classList[localStorage.night === 'true' ? 'add' : 'remove']('night')

/**************************************************************
 * Helper functions
 **************************************************************/

// const promoteWithNull = c => (c + 2) % 4 - 1
// const demoteWithNull = c => (c + 4) % 4 - 1
const promote = c => (c + 2) % 3 - 1
const demote = c => (c - 2) % 3 + 1
// const promoteNoWrap = c => c < 1 ? c + 1 : 1
// const demoteNoWrap = c => c > -1 ? c - 1 : -1

/** Return a new checkin for a given zone with potential decay */
const checkinWithDecay = (zone, i=0) => {
  if (zone.decay && zone.checkins[i] > -1) {
    // check if the decay rate has been met
    // e.g. a zone with a decay rate of 3 will only decay after 3 days in a row without a checkin
    const checkinsInDecayZone = zone.checkins.slice(i, i + zone.decay)
    const readyToDecay = same(checkinsInDecayZone) && noManualCheckins(checkinsInDecayZone, zone)
    return readyToDecay ? demote(zone.checkins[i]) : zone.checkins[i]
  }
  else {
    return zone.checkins[0]
  }
}

/** Returns true if all items in the list are the same. */
const same = list => list.reduce((prev, next) => prev === next ? next : false) !== false

/** Returns true if none of the given checkins have a manual checkin. */
const noManualCheckins = (checkinsInDecayZone, zone) => checkinsInDecayZone.every((c,i) => !(zone.manualCheckins && zone.manualCheckins[zone.checkins.length - i + 1]))

/** Get all the zones with a new column at the beginning. Needed to be separated from setState so it can be used in the constructor. */
const getNewColumn = zones => {
  return zones.map(z => {
    if (z.checkins) {
      const checkin = z.checkins[0] !== undefined && z.checkins[0] !== STATE_NULL
        ? checkinWithDecay(z)
        : STATE_NULL
      z.checkins.unshift(checkin)
    }
    else {
      z.checkins = [STATE_NULL]
    }
    return z
  })
}

/* if missing days, fill them in */
const fill = (zones, startDate) => {
  const missingDays = moment().diff(startDate, 'days') - zones[0].checkins.length + 1
  return missingDays > 0
    ? fill(getNewColumn(zones), startDate)
    : zones
}

/**************************************************************
 * App
 **************************************************************/

class App extends Component {

  constructor() {
    super()

    // load data immediately from localStorage
    const defaultStartDate = localStorage.startDate || moment().subtract(6, 'days').toISOString()
    this.state = {
      zones: fill(JSON.parse(localStorage.zones || defaultZones), defaultStartDate),
      startDate: defaultStartDate,
      showCheckins: localStorage.showCheckins === 'true',
      showFadedToday: localStorage.showFadedToday === 'true',
      night: localStorage.night === 'true',
      scrollY: window.scrollY
    }

    window.__DEBUG.addColumn = this.addColumn.bind(this)
    window.__DEBUG.removeColumn = this.removeColumn.bind(this)

    window.addEventListener('scroll', () => {
      this.setState({ scrollY: window.scrollY })
    })

    // Set to offline mode in 5 seconds. Cancelled with successful login.
    const offlineTimer = window.setTimeout(() => {
      this.setState({ offline: true })
    }, 5000)

    // check if user is logged in
    firebase.auth().onAuthStateChanged(user => {

      // if not logged in, redirect to OAuth login
      if (!user) {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithRedirect(provider)
        return
      }

      // disable offline mode
      window.clearTimeout(offlineTimer)
      this.setState({ offline: false })

      // if logged in, save the user ref and uid into state
      const userRef = firebase.database().ref('users/' + user.uid)
      this.setState({ userRef, user })

      // load Firebase data
      userRef.on('value', snapshot => {
        const value = snapshot.val()

        if (value) {
          if (value.showCheckins) {
            this.toggleShowCheckins(value.showCheckins, true)
          }

          if (value.night) {
            this.toggleNightMode(value.night, true)
          }

          if (value.showFadedToday) {
            this.toggleShowFadedToday(value.showFadedToday, true)
          }

          const startDate = value.startDate || '2018-03-24T06:00:00.000Z'
          this.saveStartDate(startDate, true)

          // if Firebase data is newer than stored data, update localStorage
          if (value.lastUpdated > (localStorage.lastUpdated || 0)) {
            this.saveZones(fill(value.zones), true, startDate)
          }
          // do nothing if Firebase data is older than stored data
        }
        // if no Firebase data, initialize with defaults
        else {
          this.saveZones(null, true)
        }
      })
    })

    this.toggleSettings = this.toggleSettings.bind(this)
    this.toggleClearCheckin = this.toggleClearCheckin.bind(this)
    this.toggleShowCheckins = this.toggleShowCheckins.bind(this)
    this.toggleNightMode = this.toggleNightMode.bind(this)
    this.zone = this.zone.bind(this)
    this.checkin = this.checkin.bind(this)
    this.dates = this.dates.bind(this)
    this.render = this.render.bind(this)
    this.addColumn = this.addColumn.bind(this)
    this.addRow = this.addRow.bind(this)
  }

  /**************************************************************
   * State Change
   **************************************************************/

  toggleSettings() {
    this.setState({ showSettings: !this.state.showSettings })
  }

  toggleClearCheckin() {
    this.setState({ clearCheckin: !this.state.clearCheckin })
  }

  toggleShowFadedToday(value, localOnly) {
    value = value || !this.state.showFadedToday
    this.setState({ showFadedToday: value }, () => {

      // update localStorage
      localStorage.showFadedToday = JSON.stringify(value)

      // update Firebase
      if (!localOnly) {
        this.state.userRef.set({ showFadedToday: value })
      }
    })
  }

  toggleShowCheckins(value, localOnly) {
    value = value || !this.state.showCheckins
    this.setState({ showCheckins: value }, () => {

      // update localStorage
      localStorage.showCheckins = JSON.stringify(value)

      // update Firebase
      if (!localOnly) {
        this.state.userRef.set({ showCheckins: value })
      }
    })
  }

  toggleNightMode(value, localOnly) {
    value = value || !this.state.night

    // manually add/remove class to body since it's outside the target element of render
    document.body.classList[value ? 'add' : 'remove']('night')

    this.setState({ night: value }, () => {

      // update localStorage
      localStorage.night = JSON.stringify(value)

      // do not sync this settings to Firebase (per-device)
    })
  }

  /** Save given zones or state zones to state, localStorage, and (optionally) Firebase. */
  saveStartDate(startDate, localOnly) {
    this.setState({ startDate }, () => {

      // update localStorage
      localStorage.startDate = startDate

      // update Firebase
      if (!localOnly) {
        this.state.userRef.set({ startDate })
      }
    })
  }

  /** Save given zones or state zones to state, localStorage, and (optionally) Firebase. */
  saveZones(zones, localOnly) {
    zones = zones || this.state.zones
    this.setState({ zones }, () => {

      // update localStorage
      localStorage.zones = JSON.stringify(zones)

      if (!localOnly) {
        localStorage.lastUpdated = Date.now()

        // update Firebase
        this.state.userRef.set({
          zones,
          startDate: this.state.startDate,
          lastUpdated: Date.now()
        })
      }
    })
  }

  // toggle the state of a checkin
  changeState(z, i) {
    z.manualCheckins = z.manualCheckins || {}

    // get conditions and values for determining a decayed checkin
    const decayedCheckin = checkinWithDecay(z, i+1)
    const useDecayedCheckin =
      // clear checkin tool
      this.state.clearCheckin ||
      // if today, rotate through decayed checkin
      // (add rotation after decayed checkin matches next checkin)
      (i === 0 && this.state.showFadedToday && z.manualCheckins[z.checkins.length - i] && z.checkins[i] === decayedCheckin)

    // set new checkin and manual checkin
    z.checkins.splice(i, 1, useDecayedCheckin ? decayedCheckin : promote(z.checkins[i]))
    z.manualCheckins[z.checkins.length - i] = !useDecayedCheckin

    this.saveZones()
  }

  addColumn() {
    this.saveZones(getNewColumn(this.state.zones))
  }

  addRow() {
    const label = prompt('Enter an emoji for your new habit:')
    if (!label) return

    const decay = +prompt('Enter a decay rate. You may enter a value greater than 0 to have the new day\'s checkin decrease if that many days has passed without change. For example, a habit with a decay rate of 3 will automatically decrease after 3 identical checkins in a row.', 0)

    const sampleCheckins = this.state.zones[0].checkins || []
    const zones = this.state.zones.concat([
      {
        label,
        decay,
        checkins: sampleCheckins.concat().fill(STATE_NULL)
      }
    ])
    this.saveZones(zones)
  }

  editRow(z) {
    const label = prompt(`Enter a new emoji for ${z.label}:`, z.label)
    if (!label) return

    const decay = +prompt('Enter a decay rate. You may enter a value greater than 0 to have the new day\'s checkin decrease if that many days has passed without change. For example, a habit with a decay rate of 3 will automatically decrease after 3 identical checkins in a row.', z.decay)

    z.label = label
    z.decay = decay
    this.saveZones()
  }

  moveRowDown(z) {
    const zones = this.state.zones.concat()
    const i = zones.indexOf(z)
    zones.splice(i, 1)
    zones.splice(i+1, 0, z)
    this.saveZones(zones)
  }

  moveRowUp(z) {
    const zones = this.state.zones.concat()
    const i = zones.indexOf(z)
    zones.splice(i, 1)
    zones.splice(i-1, 0, z)
    this.saveZones(zones)
  }

  removeRow(z) {
    if (window.confirm(`Are you sure you want to delete ${z.label}?`)) {
      const zones = this.state.zones.concat()
      zones.splice(zones.indexOf(z), 1)
      this.saveZones(zones)
    }
  }

  removeColumn() {
    const zones = this.state.zones.map(z => {
      z.checkins.shift()
      return z
    })
    this.saveZones(zones)
  }

  /**************************************************************
   * Render
   **************************************************************/

  render() {
    return <div className={'app' +
      (this.state.clearCheckin ? ' clear-checkin' : '') +
      (this.state.showSettings ? ' settings-active' : '')
    }>
      <div className='status'>
        {this.state.offline ? <span className='status-offline'>Working Offline</span> :
        !this.state.user ? <span className='status-loading'>Signing in...</span>
        : null}
      </div>
      <div className='top-options'>
        {this.state.showSettings ? <span className='settings-content'>
          {this.state.user ? <span>
            <span className='dim'>Logged in as: </span>{this.state.user.email}<br/>
            <span className='dim'>User ID: </span><span className='mono'>{this.state.user.uid}</span><br/>
          </span> : null}
          <span className='dim'>Version: </span>{pkg.version}<br/>
          <hr/>
          Mark today with faded color: <input type='checkbox' checked={this.state.showFadedToday} onChange={() => this.toggleShowFadedToday()} /><br/>
          Mark all checkins with dot: <input type='checkbox' checked={this.state.showCheckins} onChange={() => this.toggleShowCheckins()} /><br/>
          Night Mode 🌙: <input type='checkbox' checked={this.state.night} onChange={() => this.toggleNightMode()} /><br />
          Clear checkin tool: <input type='checkbox' checked={this.state.clearCheckin} onChange={this.toggleClearCheckin} /><br />
          <a className='logout' onClick={() => firebase.auth().signOut()}>Log Out</a>
        </span> : null}
        <span role='img' aria-label='settings' className={'settings-option' + (this.state.showSettings ? ' active' : '')} onClick={this.toggleSettings}>⚙️</span>
      </div>
      <div className='gradient'></div>
      <div className='desktop-mask'></div>
      <div className='content'>
        {this.state.zones ? <div>
            {this.dates()}
            <div className='zones'>
              {this.state.zones.map(this.zone)}
            </div>
            <div className='col-options'>
              <span className='box'>
                <span className='box option col-option' onClick={this.addRow}>+</span>
              </span>
            </div>
          </div>
          : <p className='loading'>Loading data...</p>
        }
      </div>
    </div>
  }

  zone(z, i) {
    return <div className='zone' key={z.label}>
      <span className='left-controls' style={{ top: 115 + i*50 - this.state.scrollY }}>
        <span className='row-options'>
          { i > 0
            ? <span className='box option option-row' onClick={() => this.moveRowUp(z)}>↑</span>
            : <span className='box option option-row option-hidden'></span>
          }
          { i < this.state.zones.length-1
            ? <span className='box option option-row' onClick={() => this.moveRowDown(z)}>↓</span>
            : <span className='box option option-row option-hidden'></span>
          }
          <span className='box option option-row' onClick={() => this.removeRow(z)}>-</span>
        </span>
        <span className='box zone-label' onClick={() => this.editRow(z)}>{z.label}</span>
      </span>
      <span className='checkins'>{z.checkins
        ? z.checkins.map((c, i) => this.checkin(c, i, z))
        : null
       }</span>
    </div>
  }

  checkin(c, i, z) {
    return <span key={i} className={'box checkin checkin' + c + (i === 0 && this.state.showFadedToday && (!z.manualCheckins || !z.manualCheckins[z.checkins.length]) ? ' faded' : '')} onClick={() => this.changeState(z, i)}>
      {this.state.showCheckins && z.manualCheckins && z.manualCheckins[z.checkins.length - i] ? <span className='manualCheckin'></span> : null}
    </span>
  }

  dates() {
    const sampleCheckins = this.state.zones[0].checkins || []

    return <div className='dates'>
      {sampleCheckins.map((checkin, i) => {
        const date = moment(this.state.startDate).add(sampleCheckins.length - i - 1, 'days')
        return <span key={i} className='box date' title={date.format('dddd, M/D')}>{date.format('D')}</span>
      })}
    </div>
  }
}

export default App
