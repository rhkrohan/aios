# SIOS Store: the preview's Store (build_concept_html/src/components/apps/
# StoreApp.tsx) as a native Qt app over Flatpak and Flathub's catalog
# (AppStream), the app system this OS uses (D9).
cmake_minimum_required(VERSION 3.22)
project(sios-store VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.6 REQUIRED COMPONENTS Core Gui Widgets Quick Qml QuickControls2 Svg Network)
find_package(AppStreamQt 1.0 REQUIRED)

qt_standard_project_setup(REQUIRES 6.6)

qt_add_executable(sios-store src/main.cpp src/catalog.cpp src/catalog.h src/broker.cpp src/broker.h)

# the QML lives in src/qml but belongs at the module's top level
set_source_files_properties(src/qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
# .js too: Connectors.qml imports Brands.js (left out, the whole window failed to load)
file(GLOB SIOS_STORE_QML RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/qml/*.qml src/qml/*.js)
foreach(f ${SIOS_STORE_QML})
    get_filename_component(name ${f} NAME)
    set_source_files_properties(${f} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
file(GLOB SIOS_STORE_ICONS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} src/icons/*.svg)

# QML is compiled into the binary, so a broken file fails the build, not the app
qt_add_qml_module(sios-store
    URI org.sios.store
    VERSION 1.0
    QML_FILES ${SIOS_STORE_QML}
    RESOURCES ${SIOS_STORE_ICONS}
)

target_link_libraries(sios-store PRIVATE
    Qt6::Core Qt6::Gui Qt6::Widgets Qt6::Quick Qt6::Qml Qt6::QuickControls2 Qt6::Svg Qt6::Network AppStreamQt
)

install(TARGETS sios-store RUNTIME DESTINATION bin)
install(FILES org.sios.store.desktop DESTINATION share/applications)
