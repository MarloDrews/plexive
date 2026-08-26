package com.plexive.mobile.core.session

import org.koin.core.annotation.ComponentScan
import org.koin.core.annotation.Configuration
import org.koin.core.annotation.Module

// SessionStore is discovered here. The TokenStorage it depends on cannot be: the Android
// implementation needs a Context that only the platform entry point holds, so each platform passes
// its own module into initKoin (androidSessionModule / iosSessionModule).
@Module
@ComponentScan
@Configuration
class SessionModule
