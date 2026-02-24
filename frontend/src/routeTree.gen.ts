import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { loginRoute } from './routes/login'
import { settingsRoute } from './routes/settings.$installationId'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  settingsRoute,
])
