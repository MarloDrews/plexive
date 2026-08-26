package com.plexive.mobile.core.session

import org.koin.core.module.Module
import org.koin.dsl.module

// iOS's TokenStorage binding, the counterpart to androidSessionModule. Passed into initKoin by
// initKoinIos.
val iosSessionModule: Module = module {
    single<TokenStorage> { KeychainTokenStorage() }
}
