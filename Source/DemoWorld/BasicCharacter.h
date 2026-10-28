// DemoWorld/Source/DemoWorld/BasicCharacter.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "BasicCharacter.generated.h"

UCLASS()
class DEMOWORLD_API ABasicCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    ABasicCharacter();

protected:
    virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

private:
    void MoveForward(float Value);
    void MoveRight(float Value);
};
