import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { PageLoader } from './components/ui'
import { IS_CONFIGURED } from './lib/config'
import Home from './pages/Home'
import JoinPage from './pages/student/JoinPage'
import StudentRoom from './pages/student/StudentRoom'
import NotFound from './pages/NotFound'
import SetupRequired from './pages/SetupRequired'
import Privacy from './pages/Privacy'

// صفحات المعلم تُحمَّل عند الحاجة فقط حتى تبقى صفحة الطالب خفيفة على الهاتف
const TeacherLogin = lazy(() => import('./pages/teacher/TeacherLogin'))
const TeacherArea = lazy(() => import('./pages/teacher/TeacherArea'))

export default function App() {
  if (!IS_CONFIGURED) return <SetupRequired />
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/room/:sessionId" element={<StudentRoom />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher/*" element={<TeacherArea />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
