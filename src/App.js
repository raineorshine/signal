import React, { Component } from 'react'
import './App.css'

const firebaseConfig = {
  apiKey: "AIzaSyA58BMqwEAw12sgI4guZbsDdVZ7yoXwDqI",
  authDomain: "zonesofprep.firebaseapp.com",
  databaseURL: "https://zonesofprep.firebaseio.com",
  projectId: "zonesofprep",
  storageBucket: "zonesofprep.appspot.com",
  messagingSenderId: "918887966885"
}

const [STATE_RED, STATE_YELLOW, STATE_GREEN, STATE_NULL] = [-1,0,1,2]

// firebase init
const firebase = window.firebase
firebase.initializeApp(firebaseConfig)
const zonesRef = firebase.database().ref('zones')

class App extends Component {
  constructor() {
    super()
    this.state = {}

    // get zones data
    zonesRef.on('value', snapshot => {
      this.setState({ zones: snapshot.val() })
    })

    this.zone = this.zone.bind(this)
    this.checkin = this.checkin.bind(this)
  }

  // toggle the state of a checkin
  changeState(z, i) {
    const value = (z.checkins[i] + 2) % 4 - 1
    z.checkins.splice(i, 1, value)
    zonesRef.set(this.state.zones)
  }

  addColumn() {
    zonesRef.set(this.state.zones.map(z => {
      z.checkins.unshift(z.checkins[0] !== undefined ? z.checkins[0] : STATE_NULL)
      return z
    }))
  }

  removeColumn() {
    zonesRef.set(this.state.zones.map(z => {
      z.checkins.shift()
      return z
    }))
  }

  render() {
    return <div className='app'>{this.state.zones
        ? this.state.zones.map(this.zone)
        : <p>Loading...</p>
      }
      <div className='options'>
        <span className='checkin col-option' onClick={() => this.addColumn()}>+</span>
        <span className='checkin col-option' onClick={() => this.removeColumn()}>-</span>
      </div>
    </div>
  }

  zone(z) {
    return <div className='zone' key={z.label}>
      <span className='zone-label'>{z.label}</span>
      <span className='checkins'>{z.checkins.map((c, i) => this.checkin(c, i, z))}</span>
    </div>
  }

  checkin(c, i, z) {
    return <span key={i} className={'checkin checkin' + c} onClick={() => this.changeState(z, i)}></span>
  }
}

export default App
