import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Queue from './screens/Queue'
import Game from './screens/Game'
import Result from './screens/Result'
import Ranking from './screens/Ranking'
import Rules from './screens/Rules'
import Skills from './screens/Skills'
import Announce from './screens/Announce'
import Leagues from './screens/Leagues'
import League from './screens/League'
import Shootout from './screens/Shootout'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/game/:matchId" element={<Game />} />
        <Route path="/result/:matchId" element={<Result />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/announce/:matchId" element={<Announce />} />
        <Route path="/leagues" element={<Leagues />} />
        <Route path="/league/:leagueId" element={<League />} />
        <Route path="/shootout/:matchId" element={<Shootout />} />
        <Route path="/rules" element={<Rules />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
