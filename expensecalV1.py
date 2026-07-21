expenses=[]
try:
    with open("expenses.txt","r") as f:
        for line in f:
            name,amount=line.strip().split(",")
            expenses.append([name,float(amount)])
except:
    pass
def save_expenses():
    with open("expenses.txt","w") as f:
        for exp in expenses:
            f.write(f"{exp[0]},{exp[1]}\n")
while True:
    print("\n=======Expenses manager=======")
    print("\n1.Add expense")
    print("2.View expenses")
    print("3.Show total")
    print("4.Delete expenses")
    print("6.Exit\n")
    choice=input("Enter your choice: ")
    
    if choice=="1":
        name=input("Enter expense name: ")
        try:
            amount=float(input("Enter amount: "))
        except:
            print("Invalid amount!")
            continue
        expenses.append([name,amount])
        save_expenses()
        print("Expense added.")
        
    elif choice=="2":
        if not expenses:
            print("Nothing added yet!")
        else:
            for i in range(len(expenses)):
                print(i+1,"-",expenses[i][0],":",expenses[i][1])
                
    elif choice=="3":
        total=0
        for exp in expenses:
                total+=exp[1]
        print("Total expense =",total)
                
    elif choice=="4":
        if not expenses:
            print("No expense(s) to delete.")
        else:
            for i in range(len(expenses)):
                print(i+1,"-",expenses[i][0],":",expenses[i][1])
            while True:
                try:
                    num=int(input("Enter expense number to delete: "))
                except:
                    print("Invalid number!")
                    continue
                if 1<=num<=len(expenses):
                    expenses.pop(num-1)
                    save_expenses()
                    print("Expense deleted.")
                    break
                else:
                    print("Invalid number !")
                    
    elif choice=="5" or  choice.strip().lower()=="no":
        print("Goodbye!")
        break
    else:
        print("Invalid choice! Choose 1-5 only.")


        
