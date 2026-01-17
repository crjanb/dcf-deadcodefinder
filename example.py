# example_project/main.py

import os       # unused import
import sys      # unused import
import math     # used import

# ==========================================================
# Commented-out code
# def old_function():
#     print("This was removed")

# ==========================================================
# Used function
def add(a, b):
    return a + b

result = add(5, 7)
print("Add result:", result)

# ==========================================================
# Unused function
def unused_function():
    print("I am never called")

# ==========================================================
# Unused function called inside a comment
# def commented_unused():
#     print("I am commented")

# ==========================================================
# Another used function
def multiply(a, b):
    return a * b

print("Multiply result:", multiply(3, 4))

# ==========================================================
# Another unused function
def get_user_data():
    user = "John Doe"
    return user
