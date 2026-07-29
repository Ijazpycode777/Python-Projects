class student:
    def __init__(self,name,age,marks):
        self.name=name
        self.age=age
        self.marks=marks
    def show(self):
        print("name: ",self.name)
        print("age: ",self.age)
        print("marks: ",self.marks)
students=[]
while True:
    print("\n1.Add students")
    print("2.View students")
    print("3.Exit\n")
    choice=input("Enter your choice: ")
    if choice=="1":
        name=input("Enter name of student: ")
        try:
            age=int(input("Enter age of student: "))
            marks=float(input("Enter marks of student: "))
        except ValueError:
            print("Enter valid digits!")
        student=student(name,age,marks)
        students.append(student)
        print("\nStudent added.")
    elif choice=="2":
        if not students:
            print("Nothing added yet!")
        else:
            for student in students:
                student.show()
    elif choice=="3":
        print("Goodbye!")
        break
    else:
        print("Invalid choice!")
