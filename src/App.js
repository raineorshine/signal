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

const startDate = moment('20180324')

// firebase init
const firebase = window.firebase
firebase.initializeApp(firebaseConfig)
window.firebase = firebase
// firebase.auth().signOut()

// init localStorage
if (!localStorage.zones) {
  localStorage.zones = defaultZones
}

/**************************************************************
 * Helper functions
 **************************************************************/

const promoteWithNull = c => (c + 2) % 4 - 1
// const demoteWithNull = c => (c + 4) % 4 - 1
// const promote = c => (c + 2) % 3 - 1
const demote = c => (c - 2) % 3 + 1
// const promoteNoWrap = c => c < 1 ? c + 1 : 1
// const demoteNoWrap = c => c > -1 ? c - 1 : -1

const checkinWithDecay = (checkins, decayRate) => {
  if (decayRate && checkins[0] > -1) {

    // check if the decay rate has been met
    // e.g. a zone with a decay rate of 3 will only decay after 3 identical checkins in a row
    const readyToDecay = checkins.slice(0, decayRate).reduce((next, prev) => next === prev ? next : false) !== false
    return readyToDecay ? demote(checkins[0]) : checkins[0]
  }
  else {
    return checkins[0]
  }
}

/** Get all the zones with a new column at the beginning. Needed to be separated from setState so it can be used in the constructor. */
const getNewColumn = zones => {
  return zones.map(z => {
    if (z.checkins) {
      const checkin = z.checkins[0] !== undefined && z.checkins[0] !== STATE_NULL
        ? checkinWithDecay(z.checkins, z.decay)
        : STATE_NULL
      z.checkins.unshift(checkin)
    }
    else {
      z.checkins = [STATE_NULL]
    }
    return z
  })
}

// if missing days, fill them in
const fill = zones => {
  const missingDays = moment().diff(startDate, 'days') - zones[0].checkins.length + 1
  return missingDays > 0
    ? fill(getNewColumn(zones))
    : zones
}

/**************************************************************
 * App
 **************************************************************/

class App extends Component {

  constructor() {
    super()

    // load data immediately from localStorage
    this.state = {
      zones: fill(JSON.parse(localStorage.zones || defaultZones)),
      showCheckins: localStorage.showCheckins === 'true'
    }

    // check if user is logged in
    firebase.auth().onAuthStateChanged(user => {

      // if not logged in, redirect to OAuth login
      if (!user) {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithRedirect(provider)
        return
      }

      // if logged in, save the user ref and uid into state
      const userRef = firebase.database().ref('users/' + user.uid)
      this.setState({ userRef, uid: user.uid })

      // load Firebase data
      userRef.on('value', snapshot => {
        const value = snapshot.val()

        if (value && value.showCheckins) {
          this.toggleShowCheckins(value.showCheckins, true)
        }

        // if no Firebase data, initialize with defaults
        if (!value)  {
          // console.log('localStorage')
          this.saveZones(null, true)
        }
        // if Firebase data is newer than stored data, update localStorage
        else if (value.lastUpdated > (localStorage.lastUpdated || 0)) {
          // console.log('Firebase')
          this.saveZones(fill(value.zones), true)
        }
        else {
          // console.log('Firebase (old)', value.lastUpdated, localStorage.lastUpdated)
        }
        // do nothing if Firebase data is older than stored data
      })
    })

    this.toggleShowCheckins = this.toggleShowCheckins.bind(this)
    this.toggleSettings = this.toggleSettings.bind(this)
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
          lastUpdated: Date.now()
        })
      }
    })
  }

  // toggle the state of a checkin
  changeState(z, i) {
    const value = promoteWithNull(z.checkins[i])
    z.checkins.splice(i, 1, value)
    z.manualCheckins = z.manualCheckins || []
    z.manualCheckins[i] = true
    this.saveZones()
  }

  addColumn() {
    this.saveZones(getNewColumn())
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
    const label = prompt(`Enter a new emoji for ${z.label}:`)
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

  // development only
  // removeColumn() {
  //   const zones = this.state.zones.map(z => {
  //     z.checkins.shift()
  //     return z
  //   })
  //   this.saveZones(zones)
  // }

  /**************************************************************
   * Render
   **************************************************************/

  render() {
    return <div className='app'>
      <div className='top-options'>
        {this.state.showSettings ? <span>
          <span className='settings-content'>
            Version: <span className='mono'>{pkg.version}</span><br/>
            User ID: <span className='mono'>{this.state.uid}</span><br/>
            Mark explicit checkins: <input type='checkbox' checked={this.state.showCheckins} onChange={() => this.toggleShowCheckins()} />
          </span>
        </span> : null}
        <span role='img' aria-label='settings' className={'settings-option' + (this.state.showSettings ? ' active' : '')} onClick={this.toggleSettings}>⚙️</span>
      </div>
      <div className='gradient'></div>
      <div className='content'>
        {this.state.uid ? <div>
          {this.state.zones ? <div>
              {this.dates()}
              <div className='zones'>
                {this.state.zones.map(this.zone)}
              </div>
              <div className='col-options'>
                <span className='box col1'>
                  <span className='box option col-option' onClick={this.addRow}>+</span>
                </span>
                {
                  // development only
                /*<span className='box option col-option' onClick={this.removeColumn}>-</span>*/}
              </div>
            </div>
            : <p>Loading data...</p>
          }
        </div>
        : <p>Signing in...</p>}
      </div>
    </div>
  }

  zone(z, i) {
    return <div className='zone' key={z.label}>
      { i > 0
        ? <span className='box option option-row' onClick={() => this.moveRowUp(z)}>↑</span>
        : <span className='box option option-row option-hidden'></span>
      }
      { i < this.state.zones.length-1
        ? <span className='box option option-row' onClick={() => this.moveRowDown(z)}>↓</span>
        : <span className='box option option-row option-hidden'></span>
      }
      <span className='box option option-row' onClick={() => this.removeRow(z)}>-</span>
      <span className='box col1 zone-label' onClick={() => this.editRow(z)}>{z.label}</span>
      <span className='checkins'>{z.checkins
        ? z.checkins.map((c, i) => this.checkin(c, i, z))
        : null
       }</span>
    </div>
  }

  checkin(c, i, z) {
    return <span key={i} className={'box checkin checkin' + c} onClick={() => this.changeState(z, i)}>
      {this.state.showCheckins && z.manualCheckins && z.manualCheckins[i] ? <span className='manualCheckin'></span> : null}
    </span>
  }

  dates() {
    const sampleCheckins = this.state.zones[0].checkins || []

    return <div className='dates'>
      {sampleCheckins.map((checkin, i) => {
        const date = moment(startDate).add(sampleCheckins.length - i - 1, 'days')
        return <span key={i} className='box date' title={date.format('dddd, M/D')}>{date.format('D')}</span>
      })}
    </div>
  }
}

export default App
