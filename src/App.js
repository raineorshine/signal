import React, { Component } from 'react'
import './App.css'

const zones = [
  {
    label: '💤',
    checkins: [1,0,0,0,1,0,-1]
  },
  {
    label: '🥗',
    checkins: [1,0,0,0,0,0,-1]
  },
  {
    label: '👟',
    checkins: [0,-0,0,1,1,0,0]
  },
  {
    label: '📿',
    checkins: [1,-1,0,0,1,0,-1]
  },
  {
    label: '💌',
    checkins: [1,-1,0,1,1,0,-1]
  },
  {
    label: '🏡',
    checkins: [0,0,0,1,0,0,0]
  }
]

class App extends Component {
  constructor() {
    super()
    this.state = { zones }

    this.zone = this.zone.bind(this)
    this.checkin = this.checkin.bind(this)
  }

  changeState(z, i) {
    const value = (z.checkins[i] + 2) % 4 - 1
    z.checkins.splice(i, 1, value)
    this.setState({ zones: this.state.zones })
  }

  render() {
    return (
      <div className='app'>{ zones.map(this.zone)}</div>
    )
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
