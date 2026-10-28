// DemoWorld/Source/DemoWorld/TreeActor.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TreeActor.generated.h"

UCLASS()
class DEMOWORLD_API ATreeActor : public AActor
{
    GENERATED_BODY()
public:
    ATreeActor();

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY(VisibleAnywhere)
    UStaticMeshComponent* MeshComp;
};
