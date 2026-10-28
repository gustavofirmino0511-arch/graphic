// DemoWorld/Source/DemoWorld/DemoWorldGameMode.cpp
#include "DemoWorldGameMode.h"
#include "BasicCharacter.h"
#include "ProceduralTerrainActor.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"

ADemoWorldGameMode::ADemoWorldGameMode()
{
    // Set default pawn class to our C++ character
    DefaultPawnClass = ABasicCharacter::StaticClass();
}

void ADemoWorldGameMode::StartPlay()
{
    Super::StartPlay();

    // Spawn procedural terrain at origin
    if (UWorld* World = GetWorld())
    {
        FActorSpawnParameters SpawnParams;
        SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        World->SpawnActor<AProceduralTerrainActor>(FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
    }
}
