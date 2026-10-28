@echo off
rem ------------------------------------------------------------
rem Run Unreal Editor directly in Game mode (no editor UI)
rem ------------------------------------------------------------
set UE_PATH="C:\Program Files\Epic Games\UE_5.4\Engine\Binaries\Win64"
set PROJECT_PATH="C:\Users\gusta\.gemini\antigravity\scratch\UnrealMedievalDemo\DemoWorld.uproject"

rem Launch the project in Game mode (will start Play automatically)
%UE_PATH%\UnrealEditor.exe %PROJECT_PATH% -game -log
